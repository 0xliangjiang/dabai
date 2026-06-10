import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import type { Repositories } from "../repositories/types.js";
import { registerAdminDealRoutes } from "./deals.js";

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

  app.post<{ Params: { id: string }; Body: { status?: string } }>(
    "/api/admin/users/:id/status",
    async (request, reply) => {
      const status = request.body?.status;
      if (status !== "active" && status !== "banned") {
        return reply.code(400).send({ error: "status must be active or banned" });
      }
      return repositories.users.updateStatus(request.params.id, status);
    }
  );

  app.get<{ Querystring: { status?: string } }>("/api/admin/claims", async (request) => ({
    claims: await repositories.orders.listClaims(request.query.status)
  }));

  await registerAdminDealRoutes(app, repositories);

  app.post<{ Params: { id: string }; Body: { status?: string } }>(
    "/api/admin/claims/:id/review",
    async (request, reply) => {
      const status = request.body?.status;
      if (status !== "approved" && status !== "rejected") {
        return reply.code(400).send({ error: "status must be approved or rejected" });
      }
      return repositories.orders.reviewClaim(request.params.id, {
        status,
        reviewedBy: "admin"
      });
    }
  );
}
