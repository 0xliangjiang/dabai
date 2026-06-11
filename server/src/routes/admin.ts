import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import type { Repositories } from "../repositories/types.js";
import type { DealPublishedNotifier } from "../domain/deal-notify.js";
import { registerAdminDealRoutes } from "./deals.js";
import { handleMediaUpload } from "./uploads.js";

export async function registerAdminRoutes(
  app: FastifyInstance,
  config: AppConfig,
  repositories: Repositories,
  uploadDir: string,
  notifyDealPublished?: DealPublishedNotifier
) {
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
      zhetaokePid: config.zhetaokePid,
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

  app.get<{ Querystring: { status?: string } }>("/api/admin/withdrawals", async (request) => ({
    withdrawals: await repositories.withdrawals.list(request.query.status)
  }));

  app.post<{ Params: { id: string }; Body: { status?: string; notes?: string } }>(
    "/api/admin/withdrawals/:id/review",
    async (request, reply) => {
      const { status, notes } = request.body ?? {};
      if (status !== "paid" && status !== "rejected") {
        return reply.code(400).send({ error: "status must be paid or rejected" });
      }
      return repositories.withdrawals.review(request.params.id, {
        status,
        reviewedBy: "admin",
        notes: notes ?? null
      });
    }
  );

  await registerAdminDealRoutes(app, repositories, notifyDealPublished);

  // 线报图文素材上传：图片 5MB，视频(mp4) 60MB
  app.post("/api/admin/uploads", (request, reply) =>
    handleMediaUpload(request, reply, uploadDir, undefined, undefined, 60 * 1024 * 1024)
  );

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
