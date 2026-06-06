import cors from "@fastify/cors";
import Fastify from "fastify";
import { type AppConfig, loadConfig } from "./config/env.js";
import { createTaobaoClient, type TaobaoClient } from "./integrations/taobao/client.js";
import { createRepositories } from "./repositories/memory.js";
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
  taobaoClient?: TaobaoClient;
};

export async function createApp(options: CreateAppOptions = {}) {
  const app = Fastify({ logger: false });
  const config = options.config ?? loadConfig();
  const repositories = createRepositories();
  const taobaoClient = options.taobaoClient ?? createTaobaoClient(config);

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

  await registerAuthRoutes(app, repositories);
  await registerConversionRoutes(app, repositories, taobaoClient);
  await registerOrderRoutes(app, repositories);
  await registerJobRoutes(app, config);
  await registerAdminRoutes(app, config, repositories);

  return app;
}
