import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import { verifyUserToken } from "./auth/token.js";
import { type AppConfig, loadConfig } from "./config/env.js";
import { getEffectiveConfig } from "./config/runtime.js";
import { createJdOrderClient, type JdOrderClient } from "./integrations/jd/orders.js";
import { createTaobaoClient, type TaobaoClient } from "./integrations/taobao/client.js";
import { createTaobaoOrderClient, type TaobaoOrderClient } from "./integrations/taobao/orders.js";
import { createRepositories } from "./repositories/memory.js";
import { createPrismaRepositories } from "./repositories/prisma.js";
import type { Repositories } from "./repositories/types.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCheckInRoutes } from "./routes/checkins.js";
import { registerWithdrawalRoutes } from "./routes/withdrawals.js";
import { registerConversionRoutes } from "./routes/conversions.js";
import { registerDealRoutes } from "./routes/deals.js";
import { registerArticleRoutes } from "./routes/articles.js";
import { createDealPublishedNotifier } from "./domain/deal-notify.js";
import { registerSubscriptionRoutes } from "./routes/subscriptions.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerOrderRoutes } from "./routes/orders.js";
import { registerUploadRoutes } from "./routes/uploads.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerClientEventRoutes } from "./routes/client-events.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
  interface FastifyInstance {
    deps: {
      config: AppConfig;
      repositories: Repositories;
      getConfig: () => Promise<AppConfig>;
      buildTaobaoClient: () => Promise<TaobaoClient>;
      buildOrderClients: () => Promise<{ orderClient: JdOrderClient; taobaoOrderClient: TaobaoOrderClient; taobaoProductClient: TaobaoClient }>;
    };
  }
}

export type CreateAppOptions = {
  config?: AppConfig;
  repositories?: Repositories;
  orderClient?: JdOrderClient;
  taobaoOrderClient?: TaobaoOrderClient;
  taobaoClient?: TaobaoClient;
  wechatAuthFetch?: typeof fetch;
};

export async function createApp(options: CreateAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    // 线上在反向代理后：信任 X-Forwarded-For，使 req.ip 为真实客户端 IP，
    // 否则按 IP 的限流会退化成所有用户共享一个全局额度
    trustProxy: true,
    logger:
      config.nodeEnv === "test"
        ? false
        : {
            level: config.nodeEnv === "production" ? "info" : "debug",
            redact: [
              "req.headers.authorization",
              "req.headers['x-admin-token']",
              "req.headers['x-scheduler-token']"
            ]
          }
  });
  const repositories = options.repositories ?? createDefaultRepositories(config);

  // 生效配置：数据库「运营设置」覆盖 > env > 默认
  const getConfig = () => getEffectiveConfig(config, repositories);
  // client 构建器：测试注入优先；否则用最新生效配置动态构建（后台改配置即时生效）
  const buildTaobaoClient = async (): Promise<TaobaoClient> =>
    options.taobaoClient ?? createTaobaoClient(await getConfig());
  const buildOrderClients = async () => {
    if (options.orderClient || options.taobaoOrderClient) {
      const taobaoProductClient = await buildTaobaoClient();
      return {
        orderClient: options.orderClient ?? createJdOrderClient(config),
        taobaoProductClient,
        taobaoOrderClient:
          options.taobaoOrderClient ??
          createTaobaoOrderClient({ apiUrl: config.zhetaokeOrderApiUrl, appKey: config.zhetaokeAppKey, sid: config.zhetaokeSid })
      };
    }
    const cfg = await getConfig();
    return {
      orderClient: createJdOrderClient(cfg),
      taobaoProductClient: createTaobaoClient(cfg),
      taobaoOrderClient: createTaobaoOrderClient({
        apiUrl: cfg.zhetaokeOrderApiUrl,
        appKey: cfg.zhetaokeAppKey,
        sid: cfg.zhetaokeSid
      })
    };
  };

  // 小程序 wx.request 不带 Origin，不受 CORS 影响；白名单只为管理后台浏览器访问
  await app.register(cors, { origin: config.corsOrigins });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    allowList: () => config.nodeEnv === "test"
  });

  // 全局上限 60MB（线报视频），各端点通过 request.file 的 limits 再收紧
  await app.register(multipart, {
    limits: { fileSize: 60 * 1024 * 1024, files: 1 }
  });

  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
  mkdirSync(uploadDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadDir,
    prefix: "/uploads/"
  });

  app.decorateRequest("userId", "");
  app.decorate("deps", { config, repositories, getConfig, buildTaobaoClient, buildOrderClients });

  app.addHook("preHandler", async (request, reply) => {
    if (
      request.url === "/health" ||
      request.url === "/api/auth/wechat-login" ||
      request.url === "/api/app-config" ||
      request.url === "/api/client-events"
    ) {
      return;
    }

    if (request.url.startsWith("/uploads/")) {
      return;
    }

    // 线报与文章公开查看，便于分享后未登录也能打开；访问上报也公开
    if (
      (request.method === "GET" && request.url.startsWith("/api/deals")) ||
      (request.method === "POST" && /^\/api\/deals\/[^/]+\/view\b/.test(request.url)) ||
      (request.method === "GET" && request.url.startsWith("/api/articles")) ||
      (request.method === "POST" && /^\/api\/articles\/[^/]+\/view\b/.test(request.url))
    ) {
      return;
    }

    if (request.url.startsWith("/api/admin") || request.url.startsWith("/api/jobs")) {
      return;
    }

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const token = authorization.slice("Bearer ".length).trim();
    const userId = resolveUserId(token, config);
    if (!userId) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    // 删除是软删除：用户带 token 回访时自动复活，重新可被后台管理（封禁才是真正拉黑）
    const user = await repositories.users.getOrReviveById(userId);
    if (user && user.status === "banned") {
      return reply.code(403).send({ error: "账号已被禁用，请联系客服" });
    }

    request.userId = userId;
  });

  app.get("/health", async () => ({ ok: true }));

  // 小程序启动时拉取的功能开关（公开，无需登录），用于审核期间隐藏兑换入口
  app.get("/api/app-config", async () => ({
    exchangeEnabled: await repositories.settings.getExchangeEnabled(),
    referralEnabled: await repositories.settings.getReferralEnabled(),
    ordersTabEnabled: await repositories.settings.getOrdersTabEnabled()
  }));

  await registerAuthRoutes(app, repositories, config, options.wechatAuthFetch);
  await registerClientEventRoutes(app);
  await registerConversionRoutes(app, repositories, config);
  await registerOrderRoutes(app, repositories, config);
  await registerUploadRoutes(app, uploadDir);
  await registerUserRoutes(app, repositories);
  await registerCheckInRoutes(app, repositories);
  await registerWithdrawalRoutes(app, repositories);
  await registerDealRoutes(app, repositories);
  await registerArticleRoutes(app, repositories);
  await registerSubscriptionRoutes(app, config, repositories);
  await registerJobRoutes(app, config, repositories);
  const dealNotifier = createDealPublishedNotifier(config, repositories, app.log);
  await registerAdminRoutes(app, config, repositories, uploadDir, dealNotifier);

  return app;
}

function resolveUserId(token: string, config: AppConfig): string | null {
  // 测试夹具仍使用 local_ 前缀的明文 token，仅限测试环境
  if (config.nodeEnv === "test" && token.startsWith("local_")) {
    return token.slice("local_".length);
  }
  return verifyUserToken(token, config.authTokenSecret);
}

function createDefaultRepositories(config: AppConfig): Repositories {
  if (config.databaseUrl && config.nodeEnv !== "test") {
    return createPrismaRepositories(config.databaseUrl);
  }
  return createRepositories();
}
