import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { processOrder, reconcileOrderLedger, resolveCommissionOptions } from "../domain/order-sync.js";
import type { AppConfig } from "../config/env.js";
import type { Repositories } from "../repositories/types.js";
import { centsToPoints } from "../domain/points.js";

export async function registerOrderRoutes(
  app: FastifyInstance,
  repositories: Repositories,
  config: AppConfig
) {
  app.get<{ Querystring: { page?: string; pageSize?: string; status?: string } }>("/api/orders/me", async (request) => {
    const page = positiveInteger(request.query.page, 1);
    const pageSize = Math.min(50, positiveInteger(request.query.pageSize, 20));
    const statuses = orderStatusesForTab(request.query.status);
    const [result, totals] = await Promise.all([
      repositories.orders.listByUser(request.userId, { page, pageSize, statuses }),
      repositories.orders.getRebateTotals(request.userId)
    ]);
    return {
      orders: result.items,
      totals: formatTotals(totals),
      total: result.total,
      page,
      pageSize,
      hasMore: page * pageSize < result.total
    };
  });

  // 刷新返利：按后台订单当前状态，对这笔订单重跑归因 + 重算台账（已结算→把待返利刷成已到账）。
  // 用完整 processOrder（含重跑归因），解决"曾被判待复核但其实属本人"的订单刷不到账的问题。幂等。
  app.post<{ Params: { id: string } }>("/api/orders/me/:id/recheck", async (request, reply) => {
    const order = await repositories.orders.findById(request.params.id);
    if (!order) return reply.code(404).send({ error: "订单不存在" });
    const attribution = await repositories.orders.getAttribution(order.tbkOrderId);
    if (!attribution || attribution.userId !== request.userId) {
      return reply.code(404).send({ error: "订单不存在" });
    }
    const options = await resolveCommissionOptions(repositories, config);
    await processOrder(repositories, order, options);
    return {
      order: await findUserOrderSummary(repositories, request.userId, order.id),
      totals: formatTotals(await repositories.orders.getRebateTotals(request.userId))
    };
  });

  app.post<{ Body: { orderNumber?: string } }>(
    "/api/orders/bind",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.headers.authorization ?? request.ip
        }
      }
    },
    async (request, reply) => {
      const orderNumber = (request.body.orderNumber ?? "").trim();
      if (orderNumber.length < 12) {
        return reply.code(400).send({ error: "请输入完整订单号（至少12位）" });
      }

      const found = await repositories.orders.findByOrderNumber(orderNumber);
      if (!found) {
        return reply.code(404).send({ error: "未找到该订单，请确认订单号是否正确，或订单尚未同步（付款后30分钟内可查到）" });
      }

      const { order, attribution } = found;

      if (order.orderStatus === "invalid" || order.orderStatus === "refunded") {
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

      // 与自动同步、后台人工归因共用同一条台账核对路径，确保结算延迟和上线提成一致。
      const options = await resolveCommissionOptions(repositories, config);
      await reconcileOrderLedger(repositories, order, options);

      return { message: "绑定成功", order: summarizeOrder(order, newAttribution) };
    }
  );

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

function orderStatusesForTab(status?: string): string[] | undefined {
  // 用户只需要四个稳定分类：已收货但尚未结算仍属于已付款阶段，
  // 失效订单与退款订单统一进入已退款，卡片内继续显示真实细分状态。
  if (status === "paid") return ["paid", "received"];
  if (status === "settled") return ["settled"];
  if (status === "refunded") return ["refunded", "invalid"];
  return undefined;
}

function formatTotals(totals: { settledPoints: number; pendingPoints: number }) {
  return {
    settledPoints: centsToPoints(totals.settledPoints),
    pendingPoints: centsToPoints(totals.pendingPoints)
  };
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

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function findUserOrderSummary(repositories: Repositories, userId: string, orderId: string) {
  for (let page = 1; ; page += 1) {
    const result = await repositories.orders.listByUser(userId, { page, pageSize: 100 });
    const found = result.items.find((order) => order.id === orderId);
    if (found || page * 100 >= result.total) return found ?? null;
  }
}
