import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";

export async function registerJobRoutes(app: FastifyInstance, config: AppConfig) {
  app.post("/api/jobs/sync-tbk-orders", async (request, reply) => {
    if (request.headers["x-scheduler-token"] !== config.schedulerToken) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    return {
      ok: true,
      synced: 0
    };
  });
}
