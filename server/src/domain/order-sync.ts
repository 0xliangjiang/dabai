import { matchOrderAttribution, titlesSameProduct, withoutCopyEvent, type AttributionResult } from "./attribution.js";
import {
  buildCommissionLedgerEntry,
  buildReferralLedgerEntry,
  resolveSharingRatio,
  type OrderCommissionStatus
} from "./commission.js";
import type { JdOrderClient } from "../integrations/jd/orders.js";
import type { TaobaoOrderClient } from "../integrations/taobao/orders.js";
import type { OrderRecord, Repositories } from "../repositories/types.js";
import type { AppConfig } from "../config/env.js";
import { getEffectiveConfig } from "../config/runtime.js";

const DEFAULT_AUTO_SETTLE_THRESHOLD_CENTS = 2000; // 20 元
const DEFAULT_AUTO_SETTLE_DELAY_DAYS = 7;

// 已收货订单的"有效结算状态"：佣金≤阈值→收货即结算；超过阈值→收货满 N 天才结算（控风险）。
// 已结算/退款/失效按原状态；其余（已付款）维持待结算。
function resolveSettlementStatus(
  order: OrderRecord,
  now: Date,
  thresholdCents: number,
  delayDays: number
): OrderCommissionStatus {
  const raw = order.orderStatus;
  if (raw === "settled") return "settled";
  if (raw === "refunded" || raw === "invalid") return raw;
  if (raw === "received") {
    const commission = order.settledCommissionCents ?? order.estimatedCommissionCents;
    if (commission <= thresholdCents) return "settled"; // 小额：收货即自动结算
    const ref = order.receivedAt ?? order.payTime; // 大额：收货满 N 天再结算
    if (now.getTime() - ref.getTime() >= delayDays * 24 * 60 * 60 * 1000) return "settled";
    return "paid"; // 未到期：维持待结算
  }
  return "paid";
}

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
  if (conversions.length > 0) {
    const candidates = conversions.map((c) => ({
      id: c.id,
      userId: c.userId,
      conversionId: c.id,
      itemId: c.itemId,
      copiedAt: c.createdAt
    }));
    const fallback = matchOrderAttribution(orderRef, candidates, { windowHours });
    if (fallback.status !== "unmatched") return withoutCopyEvent(fallback);
  }

  // 最后兜底：itemId 都对不上时（新版加密商品 itemId 常为空），按「商品标题同款」找查询记录。
  // 加密商品的转化标题(折淘客)与订单标题(淘宝)来源不同、词序/装饰各异，纯前缀会漏，
  // 改为：取下单前 windowHours 内的转化在内存里做 bigram 同款匹配；唯一候选→自动，多个→待复核。
  const title = (order.itemTitle ?? "").trim();
  if (title && title !== "淘宝商品") {
    const w = windowHours ?? 24;
    const start = new Date(order.payTime.getTime() - w * 60 * 60 * 1000);
    const recent = await repositories.conversions.listCreatedBetween(start, order.payTime, 1000);
    const titleCandidates = recent
      .filter((c) => titlesSameProduct(title, c.itemTitle))
      .map((c) => ({
        id: c.id,
        userId: c.userId,
        conversionId: c.id,
        itemId: order.itemId,
        copiedAt: c.createdAt
      }));
    const byTitle = withoutCopyEvent(matchOrderAttribution(orderRef, titleCandidates, { windowHours }));
    if (byTitle.status === "auto_matched") return { ...byTitle, reason: "title_match_single" };
    if (byTitle.status === "pending_review") return { ...byTitle, reason: "title_match_multiple" };
  }

  return attribution;
}

export type ReconcileResult = { credited: boolean; rebateStatus: "available" | "pending" | "reversed" | "none" };

// 单笔订单的台账核对（同步 / 用户「刷新返利」/ 自动兜底共用）：
// 以订单"当前权威状态"重算归属用户（及其上线）的台账，幂等（upsert / reverse 可重复执行）。
// 仅对已确认归属（auto_matched / manual_matched）入账；pending_review / unmatched 不动。
export async function reconcileOrderLedger(
  repositories: Repositories,
  order: OrderRecord,
  options: SyncOrdersOptions
): Promise<ReconcileResult> {
  const attribution = await repositories.orders.getAttribution(order.tbkOrderId);
  const userId = attribution?.userId ?? null;
  const confirmed = attribution?.status === "auto_matched" || attribution?.status === "manual_matched";
  if (!userId || !confirmed) return { credited: false, rebateStatus: "none" };

  const attrUser = await repositories.users.findById(userId);
  // 已收货按"佣金阈值 + 延迟天数"决定是否提前结算（小额收货即结算、大额收货满 N 天）
  const orderStatus = resolveSettlementStatus(
    order,
    new Date(),
    options.autoSettleThresholdCents ?? DEFAULT_AUTO_SETTLE_THRESHOLD_CENTS,
    options.autoSettleDelayDays ?? DEFAULT_AUTO_SETTLE_DELAY_DAYS
  );

  // 退款/失效：把该订单已记的台账（含上线提成）全部冲销为 reversed，从可用余额剔除。
  // 这样"已结算→退款"会正确扣回；"仅付款→退款"本就未计入，冲销后仍是净 0，安全。
  if (orderStatus === "refunded" || orderStatus === "invalid") {
    await repositories.commissionLedger.reverseOrder(userId, order.id);
    if (attrUser?.inviterId) {
      await repositories.commissionLedger.reverseOrder(attrUser.inviterId, order.id);
    }
    return { credited: true, rebateStatus: "reversed" };
  }

  const entry = buildCommissionLedgerEntry({
    userId,
    tbkOrderId: order.id,
    orderStatus,
    estimatedCommissionCents: order.estimatedCommissionCents,
    settledCommissionCents: order.settledCommissionCents,
    sharingRatio: resolveSharingRatio(attrUser?.rebateRatio, options.commissionSharingRatio)
  });
  await repositories.commissionLedger.upsert(entry);

  // 二级分销：下线有上线且开关开 → 给上线额外记一条提成（平台出，镜像下线状态）
  if (options.referralEnabled && options.referralRatio && options.referralRatio > 0 && attrUser?.inviterId) {
    await repositories.commissionLedger.upsert(buildReferralLedgerEntry(entry, attrUser.inviterId, options.referralRatio));
  }

  return { credited: true, rebateStatus: entry.status === "available" ? "available" : "pending" };
}

// 单个订单的归因 + 台账处理（JD / 淘宝共用）：
// - 人工归因（manual_matched）不被自动同步覆盖
// - 归因落库后，交给 reconcileOrderLedger 按订单当前状态写台账（"已收货→已结算"流转到积分）
async function processOrder(
  repositories: Repositories,
  order: OrderRecord,
  options: SyncOrdersOptions
): Promise<{ attributed: boolean }> {
  const existing = await repositories.orders.getAttribution(order.tbkOrderId);
  if (!(existing && existing.status === "manual_matched")) {
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
  }
  const { credited } = await reconcileOrderLedger(repositories, order, options);
  return { attributed: credited };
}

// 组装台账核对所需的佣金/分销/自动结算设置（DB 覆盖 > env > 默认），定时同步与各端点共用
export async function resolveCommissionOptions(
  repositories: Repositories,
  config: AppConfig
): Promise<
  Pick<
    SyncOrdersOptions,
    "commissionSharingRatio" | "referralEnabled" | "referralRatio" | "autoSettleThresholdCents" | "autoSettleDelayDays"
  >
> {
  const eff = await getEffectiveConfig(config, repositories);
  const commissionSharingRatio =
    (await repositories.settings.getCommissionSharingRatio()) ?? config.commissionSharingRatio;
  const referralEnabled = await repositories.settings.getReferralEnabled();
  const referralRatio = (await repositories.settings.getReferralRatio()) ?? config.referralCommissionRatio;
  return {
    commissionSharingRatio,
    referralEnabled,
    referralRatio,
    autoSettleThresholdCents: Math.round((eff.autoSettleThresholdYuan ?? 20) * 100),
    autoSettleDelayDays: eff.autoSettleDelayDays ?? DEFAULT_AUTO_SETTLE_DELAY_DAYS
  };
}

// 重跑归因：对历史「待复核 / 未归因」订单用当前归因逻辑重新匹配一遍（人工归因不动），
// 命中则落库 + 入账。供后台「重跑归因」按钮修复存量漏单。
export async function reattributePendingOrders(
  repositories: Repositories,
  options: SyncOrdersOptions
): Promise<{ scanned: number; attributed: number }> {
  const pending = await repositories.orders.listPendingAttributions();
  let attributed = 0;
  for (const { order } of pending) {
    try {
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
      const { credited } = await reconcileOrderLedger(repositories, order, options);
      if (credited) attributed += 1;
    } catch (error) {
      console.error(`[reattribute] 订单 ${order.tbkOrderId} 重跑归因失败:`, (error as Error).message);
    }
  }
  return { scanned: pending.length, attributed };
}

// 自动兜底：订单已是终态（结算/退款/失效）但台账仍 pending（结算晚于归因等导致滞后），重算入账
async function reconcileStaleLedgers(repositories: Repositories, options: SyncOrdersOptions): Promise<void> {
  const LIMIT = 200;
  const stale = await repositories.commissionLedger.listStalePending(LIMIT);
  for (const order of stale) {
    try {
      await reconcileOrderLedger(repositories, order, options);
    } catch (error) {
      console.error(`[order-sync] 兜底核对订单 ${order.tbkOrderId} 失败:`, (error as Error).message);
    }
  }
  if (stale.length >= LIMIT) {
    console.warn(`[order-sync] 兜底核对达上限 ${LIMIT}，可能仍有滞后台账留待下一轮处理`);
  }
}

export type SyncOrdersOptions = {
  startTime?: Date;
  endTime?: Date;
  pageSize?: number;
  attributionWindowHours?: number;
  commissionSharingRatio: number;
  referralEnabled?: boolean;
  referralRatio?: number;
  // 淘宝订单查询时间类型：1创建 2付款 3结算 4更新（默认 4，按更新时间捕获状态变化）
  queryType?: number;
  // 已收货自动结算：佣金≤阈值立即结算；超过则收货满 N 天再结算
  autoSettleThresholdCents?: number;
  autoSettleDelayDays?: number;
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

  // 结算兜底：再按"结算时间"(query_type=3)扫最近 3 小时（接口上限），专门补抓被更新窗(qt=4)
  // 漏掉的结算订单，把 DB 的 orderStatus 也修正到 settled（不计入 ok/计数，best-effort）。
  try {
    const settleEnd = new Date();
    // 接口最大可查 3 小时，留 2 分钟余量避免边界报错
    const settleStart = new Date(settleEnd.getTime() - (3 * 60 - 2) * 60 * 1000);
    const settle = await syncTaobaoOrders(repositories, clients.taobaoOrderClient, {
      ...options,
      startTime: settleStart,
      endTime: settleEnd,
      queryType: 3
    });
    if (settle.attributed > 0) {
      console.log(`[order-sync] 结算兜底扫描：处理 ${settle.synced} 单，归属 ${settle.attributed} 单`);
    }
  } catch (error) {
    console.error("[order-sync] 结算兜底扫描失败:", (error as Error).message);
  }

  // 自动兜底：补救"订单已结算/退款但台账仍 pending"的滞后订单（不影响同步计数与成败）
  try {
    await reconcileStaleLedgers(repositories, options);
  } catch (error) {
    console.error("[order-sync] 兜底核对整体失败:", (error as Error).message);
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
  } catch (error) {
    // 记录落库失败不应影响同步主流程，但不能完全静默（否则后台监控盲区）
    console.error("[order-sync] 写同步记录失败:", error);
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
      try {
        const order = await repositories.orders.upsert(incoming);
        const result = await processOrder(repositories, order, options);
        if (result.attributed) attributed += 1;
        synced += 1;
      } catch (error) {
        // 单条订单处理失败不应中断整批同步（如个别归因外键/数据异常）
        console.error(`[order-sync] 订单 ${incoming.tbkOrderId} 处理失败:`, (error as Error).message);
      }
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
    const page = await orderClient.fetchTaobaoOrders({
      startTime,
      endTime,
      positionIndex,
      pageSize,
      queryType: options.queryType ?? 4
    });
    for (const incoming of page.orders) {
      try {
        const order = await repositories.orders.upsert(incoming);
        const result = await processOrder(repositories, order, options);
        if (result.attributed) attributed += 1;
        synced += 1;
      } catch (error) {
        // 单条订单处理失败不应中断整批同步（如个别归因外键/数据异常）
        console.error(`[order-sync] 订单 ${incoming.tbkOrderId} 处理失败:`, (error as Error).message);
      }
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
