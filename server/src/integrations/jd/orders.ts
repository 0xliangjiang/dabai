import type { AppConfig } from "../../config/env.js";
import {
  createDingdanxiaOrderClient,
  type DingdanxiaOrder,
  type DingdanxiaOrderClient
} from "../dingdanxia/orders.js";
import { createJdUnionClient, isJdUnionConfigured, type JdUnionClient } from "./union.js";

// 京东订单同步：联盟官方 API 优先（免费），未配置时回落订单侠
export function createJdOrderClient(
  config: AppConfig,
  requestFetch: typeof fetch = fetch
): DingdanxiaOrderClient {
  const unionConfig = {
    appKey: config.jdUnionAppKey,
    appSecret: config.jdUnionAppSecret,
    siteId: config.jdUnionSiteId,
    positionId: config.jdUnionPositionId
  };
  if (isJdUnionConfigured(unionConfig)) {
    return createUnionOrderClient(createJdUnionClient(unionConfig, requestFetch));
  }
  return createDingdanxiaOrderClient(config, requestFetch);
}

function createUnionOrderClient(union: JdUnionClient): DingdanxiaOrderClient {
  return {
    async fetchJdOrders(input) {
      const { rows, hasMore } = await union.orderRowQuery({
        startTime: input.startTime,
        endTime: input.endTime,
        pageIndex: input.pageIndex ?? 1,
        pageSize: input.pageSize ?? 100
      });
      return {
        orders: rows.map(normalizeUnionOrder).filter((order): order is DingdanxiaOrder => Boolean(order)),
        hasNext: hasMore
      };
    }
  };
}

function normalizeUnionOrder(row: Record<string, unknown>): DingdanxiaOrder | null {
  const tbkOrderId = String(row.id ?? row.orderId ?? "").trim();
  const itemId = String(row.skuId ?? "").trim();
  if (!tbkOrderId || !itemId) {
    return null;
  }

  const validCode = Number(row.validCode ?? 16);
  const actualFee = yuanToCents(row.actualFee);
  const estimatedFee = yuanToCents(row.estimateFee);

  return {
    tbkOrderId,
    itemId,
    itemTitle: String(row.skuName ?? "京东订单"),
    payTime: parseJdTime(row.orderTime) ?? new Date(),
    payAmountCents: yuanToCents(row.estimateCosPrice ?? row.actualCosPrice ?? row.price),
    estimatedCommissionCents: estimatedFee,
    settledCommissionCents: actualFee > 0 ? actualFee : null,
    orderStatus: mapJdValidCode(validCode),
    rawPayload: row
  };
}

// 京东 validCode：15 待付款 16 已付款 17 已完成 18 已结算 24 等；与订单侠路径保持同一映射
function mapJdValidCode(validCode: number): string {
  if (validCode === 17 || validCode === 18) return "settled";
  if (validCode === 16 || validCode === 15 || validCode === 24) return "paid";
  if (validCode > 0) return "invalid";
  return "paid";
}

function yuanToCents(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

// 官方接口 orderTime 可能是毫秒时间戳或 "yyyy-MM-dd HH:mm:ss"
function parseJdTime(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" || /^\d{12,}$/.test(String(value))) {
    const date = new Date(Number(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}
