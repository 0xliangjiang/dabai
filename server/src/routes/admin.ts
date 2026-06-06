import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import type { Repositories } from "../repositories/memory.js";

export async function registerAdminRoutes(app: FastifyInstance, config: AppConfig, repositories: Repositories) {
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/admin")) {
      return;
    }

    if (request.headers["x-admin-token"] !== config.adminToken) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/api/admin/overview", async () => ({
    metrics: repositories.admin.overview()
  }));

  app.get("/api/admin/users", async () => ({
    users: repositories.users.list()
  }));

  app.get("/api/admin/config", async () => ({
    config: {
      adzoneId: config.adzoneId,
      commissionSharingRatio: config.commissionSharingRatio,
      attributionWindowHours: 24,
      highValueReviewThresholdCents: 5000
    }
  }));

  app.get("/api/admin/pending-attributions", async (request, reply) => {
    return {
      items: []
    };
  });

  app.post<{ Params: { id: string } }>("/api/admin/orders/:id/attribute", async (request, reply) => {
    return {
      id: request.params.id,
      status: "manual_matched"
    };
  });
}
