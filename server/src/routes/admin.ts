import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";

export async function registerAdminRoutes(app: FastifyInstance, config: AppConfig) {
  app.get("/api/admin/pending-attributions", async (request, reply) => {
    if (request.headers["x-admin-token"] !== config.adminToken) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    return {
      items: []
    };
  });

  app.post<{ Params: { id: string } }>("/api/admin/orders/:id/attribute", async (request, reply) => {
    if (request.headers["x-admin-token"] !== config.adminToken) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    return {
      id: request.params.id,
      status: "manual_matched"
    };
  });
}
