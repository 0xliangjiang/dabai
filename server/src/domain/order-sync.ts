import { matchOrderAttribution, type AttributionResult } from "./attribution.js";
import {
  buildCommissionLedgerEntry,
  buildReferralLedgerEntry,
  resolveSharingRatio,
  type OrderCommissionStatus
} from "./commission.js";
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
  const orderStatus = normalizeCommissionStatus(order.orderStatus);

  // 退款/失效：把该订单已记的台账（含上线提成）全部冲销为 reversed，从可用余额剔除。
  // 这样"已结算→退款"会正确扣回；"仅付款→退款"本就未计入，冲销后仍是净 0，安全。
  if (orderStatus === "refunded" || orderStatus === "invalid") {
    await repositories.commissionLedger.reverseOrder(attributedUserId, order.id);
    if (attrUser?.inviterId) {
      await repositories.commissionLedger.reverseOrder(attrUser.inviterId, order.id);
    }
    return { attributed: true };
  }

  const entry = buildCommissionLedgerEntry({
    userId: attributedUserId,
    tbkOrderId: order.id,
    orderStatus,
    estimatedCommissionCents: order.estimatedCommissionCents,
    settledCommissionCents: order.settledCommissionCents,
    sharingRatio: resolveSharingRatio(attrUser?.rebateRatio, options.commissionSharingRatio)
  });
  await repositories.commissionLedger.upsert(entry);

  // 二级分销：下线有上线且开关开 → 给上线额外记一条提成（平台出，镜像下线状态）
  if (options.referralEnabled && options.referralRatio && options.referralRatio > 0 && attrUser?.inviterId) {
    const referralEntry = buildReferralLedgerEntry(entry, attrUser.inviterId, options.referralRatio);
    await repositories.commissionLedger.upsert(referralEntry);
  }

  return { attributed: true };
}

export type SyncOrdersOptions = {
  startTime?: Date;
  endTime?: Date;
  pageSize?: number;
  attributionWindowHours?: number;
  commissionSharingRatio: number;
  referralEnabled?: boolean;
  referralRatio?: number;
};

export type OrderSyncRunResult = {
  ok: boolean;
  taobaoSynced: number;
  taobaoAttributed: number;
  jdSynced: number;
  jdAttributed: number;
  errorMessage: string | null;
  durationMs: number;
};

// 跑一轮订单同步（淘宝 + 京东）并落一条同步记录，定时循环与手动接口共用。
// - allSettled：单平台失败不影响另一平台计数照常入账
// - 任一平台失败 → ok=false，errorMessage 汇总失败平台与原因（失败才是最该看到的）
// - 记录写库失败只吞掉（记录功能不能拖垮同步本身），交由调用方记日志
export async function runOrderSync(
  repositories: Repositories,
  clients: { taobaoOrderClient: TaobaoOrderClient; orderClient: JdOrderClient },
  options: SyncOrdersOptions,
  trigger: "auto" | "manual"
): Promise<OrderSyncRunResult> {
  const startedAt = Date.now();
  const [taobao, jd] = await Promise.allSettled([
    syncTaobaoOrders(repositories, clients.taobaoOrderClient, options),
    syncJdOrders(repositories, clients.orderClient, options)
  ]);

  const errors: string[] = [];
  let taobaoSynced = 0;
  let taobaoAttributed = 0;
  let jdSynced = 0;
  let jdAttributed = 0;

  if (taobao.status === "fulfilled") {
    taobaoSynced = taobao.value.synced;
    taobaoAttributed = taobao.value.attributed;
  } else {
    errors.push(`淘宝同步失败：${errorText(taobao.reason)}`);
  }
  if (jd.status === "fulfilled") {
    jdSynced = jd.value.synced;
    jdAttributed = jd.value.attributed;
  } else {
    errors.push(`京东同步失败：${errorText(jd.reason)}`);
  }

  const result: OrderSyncRunResult = {
    ok: errors.length === 0,
    taobaoSynced,
    taobaoAttributed,
    jdSynced,
    jdAttributed,
    errorMessage: errors.length > 0 ? errors.join("；").slice(0, 1024) : null,
    durationMs: Date.now() - startedAt
  };

  try {
    await repositories.syncRuns.record({ trigger, ...result });
  } catch {
    // 记录落库失败不应影响同步主流程；调用方会有日志
  }

  return result;
}

function errorText(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

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
