import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildCommissionLedgerEntry } from "../domain/commission.js";
import type { Repositories } from "../repositories/types.js";

export async function registerOrderRoutes(
  app: FastifyInstance,
  repositories: Repositories,
  commissionSharingRatio: number
) {
  app.get("/api/orders/me", async (request) => ({
    orders: await repositories.orders.listByUser(request.userId)
  }));

  app.post<{ Body: { orderNumber?: string } }>("/api/orders/bind", async (request, reply) => {
    const orderNumber = (request.body.orderNumber ?? "").trim();
    if (orderNumber.length < 4) {
      return reply.code(400).send({ error: "请输入至少4位订单号" });
    }

    const found = await repositories.orders.findByOrderNumber(orderNumber);
    if (!found) {
      return reply.code(404).send({ error: "未找到该订单，请确认订单号是否正确，或订单尚未同步（付款后30分钟内可查到）" });
    }

    const { order, attribution } = found;

    if (order.orderStatus === "invalid") {
      return reply.code(400).send({ error: "该订单已失效或已退款，无法绑定" });
    }

    if (attribution?.userId && attribution.userId !== request.userId) {
      return reply.code(409).send({ error: "该订单已归属其他用户" });
    }

    if (attribution?.userId === request.userId) {
      return reply.code(200).send({ message: "该订单已在您的账户中", order: summarizeOrder(order, attribution) });
    }

    // 归属到当前用户
    const newAttribution = await repositories.orders.upsertAttribution({
      tbkOrderId: order.tbkOrderId,
      status: "manual_matched",
      confidence: 1,
      reason: "user_self_bind",
      userId: request.userId,
      conversionId: null,
      copyEventId: null
    });

    // 更新 commission 台账
    const entry = buildCommissionLedgerEntry({
      userId: request.userId,
      tbkOrderId: order.id,
      orderStatus: normalizeStatus(order.orderStatus),
      estimatedCommissionCents: order.estimatedCommissionCents,
      settledCommissionCents: order.settledCommissionCents,
      sharingRatio: commissionSharingRatio
    });
    await repositories.commissionLedger.upsert(entry);

    return { message: "绑定成功", order: summarizeOrder(order, newAttribution) };
  });

  app.post<{
    Body: { orderSuffix?: string; screenshotUrl?: string; notes?: string };
  }>("/api/orders/claim", async (request, reply) => {
    const parsed = claimSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "orderSuffix is required" });
    }

    const claim = await repositories.orders.createClaim({
      userId: request.userId,
      orderSuffix: parsed.data.orderSuffix,
      screenshotUrl: parsed.data.screenshotUrl,
      notes: parsed.data.notes
    });

    return { ...claim, status: "pending_review" };
  });
}

function normalizeStatus(status: string) {
  if (status === "settled" || status === "refunded" || status === "invalid") return status;
  return "paid" as const;
}

function summarizeOrder(order: { itemTitle: string; orderStatus: string; estimatedCommissionCents: number }, attribution: { userId: string | null }) {
  return {
    itemTitle: order.itemTitle,
    status: order.orderStatus,
    estimatedCommissionCents: order.estimatedCommissionCents,
    userId: attribution.userId
  };
}

const claimSchema = z.object({
  orderSuffix: z.string().trim().min(4).max(32),
  screenshotUrl: z
    .string()
    .trim()
    .refine((value) => value === "" || value.startsWith("/uploads/") || /^https:\/\//.test(value), {
      message: "screenshotUrl must be an uploaded file path or https URL"
    })
    .optional(),
  notes: z.string().trim().max(500).optional().or(z.literal(""))
});
