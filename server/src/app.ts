import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import { verifyUserToken } from "./auth/token.js";
import { type AppConfig, loadConfig } from "./config/env.js";
import { createDingdanxiaOrderClient, type DingdanxiaOrderClient } from "./integrations/dingdanxia/orders.js";
import { createTaobaoClient, type TaobaoClient } from "./integrations/taobao/client.js";
import { createRepositories } from "./repositories/memory.js";
import { createPrismaRepositories } from "./repositories/prisma.js";
import type { Repositories } from "./repositories/types.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCheckInRoutes } from "./routes/checkins.js";
import { registerConversionRoutes } from "./routes/conversions.js";
import { registerDealRoutes } from "./routes/deals.js";
import { createDealPublishedNotifier } from "./domain/deal-notify.js";
import { createSubscribeMessageSender } from "./integrations/wechat/subscribe.js";
import { registerSubscriptionRoutes } from "./routes/subscriptions.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerOrderRoutes } from "./routes/orders.js";
import { registerUploadRoutes } from "./routes/uploads.js";
import { registerUserRoutes } from "./routes/users.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
  interface FastifyInstance {
    deps: {
      config: AppConfig;
      repositories: Repositories;
      orderClient: DingdanxiaOrderClient;
    };
  }
}

export type CreateAppOptions = {
  config?: AppConfig;
  repositories?: Repositories;
  orderClient?: DingdanxiaOrderClient;
  taobaoClient?: TaobaoClient;
  wechatAuthFetch?: typeof fetch;
};

export async function createApp(options: CreateAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const app = Fastify({
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
  const taobaoClient = options.taobaoClient ?? createTaobaoClient(config);
  const orderClient = options.orderClient ?? createDingdanxiaOrderClient(config);

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
  app.decorate("deps", { config, repositories, orderClient });

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health" || request.url === "/api/auth/wechat-login") {
      return;
    }

    if (request.url.startsWith("/uploads/")) {
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

    const user = await repositories.users.findById(userId);
    if (user && user.status === "banned") {
      return reply.code(403).send({ error: "账号已被禁用，请联系客服" });
    }

    request.userId = userId;
  });

  app.get("/health", async () => ({ ok: true }));

  await registerAuthRoutes(app, repositories, config, options.wechatAuthFetch);
  await registerConversionRoutes(app, repositories, taobaoClient, config.commissionSharingRatio);
  await registerOrderRoutes(app, repositories);
  await registerUploadRoutes(app, uploadDir);
  await registerUserRoutes(app, repositories);
  await registerCheckInRoutes(app, repositories);
  await registerDealRoutes(app, repositories);
  await registerSubscriptionRoutes(app, config, repositories);
  await registerJobRoutes(app, config, repositories, orderClient);
  const dealNotifier = createDealPublishedNotifier(
    config,
    repositories,
    createSubscribeMessageSender(config),
    app.log
  );
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
    return createPrismaRepositories();
  }
  return createRepositories();
}
