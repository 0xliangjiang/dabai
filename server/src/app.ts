import cors from "@fastify/cors";
import Fastify from "fastify";
import { type AppConfig, loadConfig } from "./config/env.js";
import { createDingdanxiaOrderClient, type DingdanxiaOrderClient } from "./integrations/dingdanxia/orders.js";
import { createTaobaoClient, type TaobaoClient } from "./integrations/taobao/client.js";
import { createRepositories } from "./repositories/memory.js";
import { createPrismaRepositories } from "./repositories/prisma.js";
import type { Repositories } from "./repositories/types.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerConversionRoutes } from "./routes/conversions.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerOrderRoutes } from "./routes/orders.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
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
  const app = Fastify({ logger: false });
  const config = options.config ?? loadConfig();
  const repositories = options.repositories ?? createDefaultRepositories(config);
  const taobaoClient = options.taobaoClient ?? createTaobaoClient(config);
  const orderClient = options.orderClient ?? createDingdanxiaOrderClient(config);

  await app.register(cors, { origin: true });

  app.decorateRequest("userId", "");

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health" || request.url === "/api/auth/wechat-login") {
      return;
    }

    if (request.url.startsWith("/api/admin") || request.url.startsWith("/api/jobs")) {
      return;
    }

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer local_")) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    request.userId = authorization.replace("Bearer local_", "");
  });

  app.get("/health", async () => ({ ok: true }));

  await registerAuthRoutes(app, repositories, config, options.wechatAuthFetch);
  await registerConversionRoutes(app, repositories, taobaoClient, config.commissionSharingRatio);
  await registerOrderRoutes(app, repositories);
  await registerJobRoutes(app, config, repositories, orderClient);
  await registerAdminRoutes(app, config, repositories);

  return app;
}

function createDefaultRepositories(config: AppConfig): Repositories {
  if (config.databaseUrl && config.nodeEnv !== "test") {
    return createPrismaRepositories();
  }
  return createRepositories();
}
