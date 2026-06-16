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

  app.get("/api/admin/config", async () => {
    const dbRatio = await repositories.settings.getCommissionSharingRatio();
    return {
      config: {
        zhetaokePid: config.zhetaokePid,
        commissionSharingRatio: dbRatio ?? config.commissionSharingRatio,
        attributionWindowHours: 24,
        highValueReviewThresholdCents: 5000
      }
    };
  });

  app.post<{ Body: { commissionSharingRatio?: number } }>(
    "/api/admin/config/commission-ratio",
    async (request, reply) => {
      const ratio = request.body?.commissionSharingRatio;
      if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
        return reply.code(400).send({ error: "比例需为 0~1 之间的数字" });
      }
      await repositories.settings.setCommissionSharingRatio(ratio);
      return { ok: true, commissionSharingRatio: ratio };
    }
  );

  app.post<{ Params: { id: string }; Body: { ratio?: number | null } }>(
    "/api/admin/users/:id/rebate-ratio",
    async (request, reply) => {
      const ratio = request.body?.ratio;
      if (ratio !== null && (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0 || ratio > 1)) {
        return reply.code(400).send({ error: "比例需为 0~1 之间的数字，或留空表示用全局" });
      }
      const user = await repositories.users.setRebateRatio(request.params.id, ratio ?? null);
      return { ok: true, user };
    }
  );

  app.get<{ Querystring: { page?: string; pageSize?: string; orderStatus?: string; attributionStatus?: string } }>(
    "/api/admin/orders",
    async (request) => {
      return repositories.orders.listAllOrders({
        page: request.query.page ? Number(request.query.page) : 1,
        pageSize: request.query.pageSize ? Number(request.query.pageSize) : 50,
        orderStatus: request.query.orderStatus,
        attributionStatus: request.query.attributionStatus
      });
    }
  );

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

  app.delete<{ Params: { id: string } }>("/api/admin/users/:id", async (request, reply) => {
    await repositories.users.deleteUser(request.params.id);
    return reply.code(200).send({ ok: true });
  });

  app.post<{ Params: { id: string }; Body: { delta?: number; reason?: string } }>(
    "/api/admin/users/:id/adjust-points",
    async (request, reply) => {
      const { delta, reason } = request.body ?? {};
      if (!delta || !Number.isInteger(delta)) {
        return reply.code(400).send({ error: "delta 必须为整数" });
      }
      await repositories.users.adjustPoints(request.params.id, {
        delta,
        reason: reason ?? "admin_manual"
      });
      return { ok: true };
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
