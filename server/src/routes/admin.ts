import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import type { Repositories } from "../repositories/types.js";

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
    metrics: await repositories.admin.overview()
  }));

  app.get("/api/admin/users", async () => ({
    users: await repositories.users.list()
  }));

  app.get("/api/admin/config", async () => ({
    config: {
      dingdanxiaPid: config.dingdanxiaPid,
      commissionSharingRatio: config.commissionSharingRatio,
      attributionWindowHours: 24,
      highValueReviewThresholdCents: 5000
    }
  }));

  app.get("/api/admin/pending-attributions", async () => {
    return {
      items: await repositories.orders.listPendingAttributions()
    };
  });

  app.post<{ Params: { id: string }; Body: { userId?: string } }>(
    "/api/admin/orders/:id/attribute",
    async (request) => {
      return repositories.orders.attributeOrder(request.params.id, {
        userId: request.body?.userId,
        reviewedBy: "admin"
      });
    }
  );
}
