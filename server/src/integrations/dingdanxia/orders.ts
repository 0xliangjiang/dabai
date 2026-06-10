import type { AppConfig } from "../../config/env.js";

export type DingdanxiaOrder = {
  tbkOrderId: string;
  itemId: string;
  itemTitle: string;
  payTime: Date;
  payAmountCents: number;
  estimatedCommissionCents: number;
  settledCommissionCents: number | null;
  orderStatus: string;
  rawPayload: unknown;
};

export type DingdanxiaOrderClient = {
  fetchJdOrders(input: { startTime: Date; endTime: Date; pageIndex?: number; pageSize?: number }): Promise<{
    orders: DingdanxiaOrder[];
    hasNext: boolean;
  }>;
};

export function createDingdanxiaOrderClient(
  config: AppConfig,
  requestFetch: typeof fetch = fetch
): DingdanxiaOrderClient {
  return {
    async fetchJdOrders(input) {
      const pageIndex = input.pageIndex ?? 1;
      const pageSize = input.pageSize ?? 100;
      const body = new URLSearchParams({
        apikey: config.dingdanxiaApiKey,
        pageIndex: String(pageIndex),
        pageSize: String(pageSize),
        type: "3",
        startTime: formatDingdanxiaTime(input.startTime),
        endTime: formatDingdanxiaTime(input.endTime)
      });

      if (config.dingdanxiaJdAuthKey) {
        body.set("key", config.dingdanxiaJdAuthKey);
      }

      const response = await requestFetch(config.dingdanxiaJdOrderApiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body
      });

      if (!response.ok) {
        throw new Error(`Dingdanxia JD order sync failed: HTTP ${response.status}`);
      }

      const payload = await response.json();
      const code = Number(payload?.code ?? payload?.status ?? 200);
      if (code !== 200 && code !== 0) {
        throw new Error(`Dingdanxia JD order sync failed: ${payload?.msg ?? payload?.message ?? code}`);
      }

      const rows = extractRows(payload);
      const hasNext = Boolean(payload?.data?.hasNext ?? payload?.hasNext ?? rows.length >= pageSize);
      return {
        orders: rows.map(normalizeJdOrder).filter((order): order is DingdanxiaOrder => Boolean(order)),
        hasNext
      };
    }
  };
}

function extractRows(payload: any): any[] {
  const candidates = [
    payload?.data?.result,
    payload?.data?.list,
    payload?.data?.data,
    payload?.result,
    payload?.list,
    payload?.data
  ];
  const rows = candidates.find((candidate) => Array.isArray(candidate));
  return rows ?? [];
}

function normalizeJdOrder(row: any): DingdanxiaOrder | null {
  const tbkOrderId = String(row.id ?? row.orderId ?? row.order_id ?? row.rowId ?? "").trim();
  const itemId = String(row.skuId ?? row.sku_id ?? row.itemId ?? row.item_id ?? "").trim();
  if (!tbkOrderId || !itemId) {
    return null;
  }

  const paidAt = parseDate(row.orderTime ?? row.payTime ?? row.createTime ?? row.modifyTime) ?? new Date();
  const validCode = Number(row.validCode ?? row.valid_code ?? 16);
  const actualFee = parseMoneyToCents(row.actualFee ?? row.actualCommission);
  const estimatedFee = parseMoneyToCents(row.estimateFee ?? row.estimateCommission ?? row.commission);

  return {
    tbkOrderId,
    itemId,
    itemTitle: String(row.skuName ?? row.itemTitle ?? row.title ?? "京东订单"),
    payTime: paidAt,
    payAmountCents: parseMoneyToCents(row.payPrice ?? row.estimateCosPrice ?? row.price),
    estimatedCommissionCents: estimatedFee,
    settledCommissionCents: actualFee > 0 ? actualFee : null,
    orderStatus: mapJdValidCode(validCode),
    rawPayload: row
  };
}

function mapJdValidCode(validCode: number): string {
  if (validCode === 17 || validCode === 18) {
    return "settled";
  }
  if (validCode === 16 || validCode === 15 || validCode === 24) {
    return "paid";
  }
  if (validCode > 0 && validCode !== 16 && validCode !== 17 && validCode !== 18 && validCode !== 24) {
    return "invalid";
  }
  return "paid";
}

function parseMoneyToCents(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 100);
}

function parseDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDingdanxiaTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds())
  ].join("");
}
