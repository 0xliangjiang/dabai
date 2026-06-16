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

// 单个订单的归因 + 台账处理（JD / 淘宝共用）：
// - 人工归因（manual_matched）不被自动同步覆盖
// - 只要有归属用户，就按订单当前状态写台账，让"已收货→已结算"流转到积分
async function processOrder(
  repositories: Repositories,
  order: OrderRecord,
  options: SyncOrdersOptions
): Promise<{ attributed: boolean }> {
  const existing = await repositories.orders.getAttribution(order.tbkOrderId);
  let attributedUserId: string | null = null;

  if (existing && existing.status === "manual_matched") {
    attributedUserId = existing.userId;
  } else {
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
    if (attribution.status === "auto_matched") attributedUserId = attribution.userId;
  }

  if (!attributedUserId) return { attributed: false };

  const attrUser = await repositories.users.findById(attributedUserId);
  const entry = buildCommissionLedgerEntry({
    userId: attributedUserId,
    tbkOrderId: order.id,
    orderStatus: normalizeCommissionStatus(order.orderStatus),
    estimatedCommissionCents: order.estimatedCommissionCents,
    settledCommissionCents: order.settledCommissionCents,
    sharingRatio: resolveSharingRatio(attrUser?.rebateRatio, options.commissionSharingRatio)
  });
  await repositories.commissionLedger.upsert(entry);
  return { attributed: true };
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
      const result = await processOrder(repositories, order, options);
      if (result.attributed) attributed += 1;
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
    const page = await orderClient.fetchTaobaoOrders({ startTime, endTime, positionIndex, pageSize, queryType: 4 });
    for (const incoming of page.orders) {
      const order = await repositories.orders.upsert(incoming);
      const result = await processOrder(repositories, order, options);
      if (result.attributed) attributed += 1;
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
