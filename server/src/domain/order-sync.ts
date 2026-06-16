import { matchOrderAttribution, type AttributionResult } from "./attribution.js";
import { buildCommissionLedgerEntry, resolveSharingRatio, type OrderCommissionStatus } from "./commission.js";
import type { JdOrderClient } from "../integrations/jd/orders.js";
import type { TaobaoOrderClient } from "../integrations/taobao/orders.js";
import type { OrderRecord, Repositories } from "../repositories/types.js";

// 归因：优先用「复制事件」（强信号）；无复制候选时回退到「查询/转链记录」（弱信号），
// 解决"用户查过但没点复制"也能归因。多候选会进待复核，避免热门商品误判。
async function resolveOrderAttribution(
  repositories: Repositories,
  order: OrderRecord,
  windowHours: number | undefined
): Promise<AttributionResult> {
  const orderRef = { id: order.id, itemId: order.itemId, paidAt: order.payTime };
  const copyEvents = await repositories.copyEvents.listByItem(order.itemId);
  const attribution = matchOrderAttribution(orderRef, copyEvents, { windowHours });
  if (attribution.status !== "unmatched") return attribution;

  const conversions = await repositories.conversions.listByItem(order.itemId);
  if (conversions.length === 0) return attribution;
  const candidates = conversions.map((c) => ({
    id: c.id,
    userId: c.userId,
    conversionId: c.id,
    itemId: c.itemId,
    copiedAt: c.createdAt
  }));
  const fallback = matchOrderAttribution(orderRef, candidates, { windowHours });
  return fallback.status === "unmatched" ? attribution : fallback;
}

export type SyncOrdersOptions = {
  startTime?: Date;
  endTime?: Date;
  pageSize?: number;
  attributionWindowHours?: number;
  commissionSharingRatio: number;
};

export async function syncJdOrders(
  repositories: Repositories,
  orderClient: JdOrderClient,
  options: SyncOrdersOptions
) {
  const endTime = options.endTime ?? new Date();
  const startTime = options.startTime ?? new Date(endTime.getTime() - 30 * 60 * 1000);
  const pageSize = options.pageSize ?? 100;
  let pageIndex = 1;
  let synced = 0;
  let attributed = 0;

  while (true) {
    const page = await orderClient.fetchJdOrders({ startTime, endTime, pageIndex, pageSize });
    for (const incoming of page.orders) {
      const order = await repositories.orders.upsert(incoming);
      const attribution = await resolveOrderAttribution(repositories, order, options.attributionWindowHours);

      await repositories.orders.upsertAttribution({
        tbkOrderId: order.tbkOrderId,
        status: attribution.status,
        confidence: attribution.confidence,
        reason: attribution.reason,
        userId: "userId" in attribution ? attribution.userId : null,
        conversionId: "conversionId" in attribution ? attribution.conversionId : null,
        copyEventId: "copyEventId" in attribution ? attribution.copyEventId : null
      });

      if (attribution.status === "auto_matched") {
        attributed += 1;
        const attrUser = await repositories.users.findById(attribution.userId);
        const entry = buildCommissionLedgerEntry({
          userId: attribution.userId,
          tbkOrderId: order.id,
          orderStatus: normalizeCommissionStatus(order.orderStatus),
          estimatedCommissionCents: order.estimatedCommissionCents,
          settledCommissionCents: order.settledCommissionCents,
          sharingRatio: resolveSharingRatio(attrUser?.rebateRatio, options.commissionSharingRatio)
        });
        await repositories.commissionLedger.upsert(entry);
      }

      synced += 1;
    }

    if (!page.hasNext || page.orders.length === 0) {
      break;
    }
    pageIndex += 1;
  }

  return {
    ok: true,
    synced,
    attributed,
    startTime,
    endTime
  };
}

export async function syncTaobaoOrders(
  repositories: Repositories,
  orderClient: TaobaoOrderClient,
  options: SyncOrdersOptions
) {
  const endTime = options.endTime ?? new Date();
  const startTime = options.startTime ?? new Date(endTime.getTime() - 2 * 60 * 60 * 1000);
  const pageSize = options.pageSize ?? 100;
  let positionIndex: string | undefined;
  let synced = 0;
  let attributed = 0;

  while (true) {
    const page = await orderClient.fetchTaobaoOrders({ startTime, endTime, positionIndex, pageSize });
    for (const incoming of page.orders) {
      const order = await repositories.orders.upsert(incoming);
      const attribution = await resolveOrderAttribution(repositories, order, options.attributionWindowHours);

      await repositories.orders.upsertAttribution({
        tbkOrderId: order.tbkOrderId,
        status: attribution.status,
        confidence: attribution.confidence,
        reason: attribution.reason,
        userId: "userId" in attribution ? attribution.userId : null,
        conversionId: "conversionId" in attribution ? attribution.conversionId : null,
        copyEventId: "copyEventId" in attribution ? attribution.copyEventId : null
      });

      if (attribution.status === "auto_matched") {
        attributed += 1;
        const attrUser = await repositories.users.findById(attribution.userId);
        const entry = buildCommissionLedgerEntry({
          userId: attribution.userId,
          tbkOrderId: order.id,
          orderStatus: normalizeCommissionStatus(order.orderStatus),
          estimatedCommissionCents: order.estimatedCommissionCents,
          settledCommissionCents: order.settledCommissionCents,
          sharingRatio: resolveSharingRatio(attrUser?.rebateRatio, options.commissionSharingRatio)
        });
        await repositories.commissionLedger.upsert(entry);
      }

      synced += 1;
    }

    if (!page.hasNext || page.orders.length === 0) break;
    positionIndex = page.positionIndex;
  }

  return { ok: true, synced, attributed, startTime, endTime };
}

function normalizeCommissionStatus(status: string): OrderCommissionStatus {
  if (status === "settled" || status === "refunded" || status === "invalid") {
    return status;
  }
  return "paid";
}
