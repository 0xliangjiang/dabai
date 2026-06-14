export type TaobaoOrder = {
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

export type TaobaoOrderClient = {
  fetchTaobaoOrders(input: {
    startTime: Date;
    endTime: Date;
    pageIndex?: number;
    pageSize?: number;
  }): Promise<{ orders: TaobaoOrder[]; hasNext: boolean }>;
};

type ZhetaokeOrderConfig = {
  apiUrl: string;
  appKey: string;
  sid: string;
};

export function createTaobaoOrderClient(
  config: ZhetaokeOrderConfig,
  fetcher: typeof fetch = fetch
): TaobaoOrderClient {
  if (!config.appKey || !config.sid) {
    return { async fetchTaobaoOrders() { return { orders: [], hasNext: false }; } };
  }

  return {
    async fetchTaobaoOrders(input) {
      const pageIndex = input.pageIndex ?? 1;
      const pageSize = input.pageSize ?? 100;

      const body = new URLSearchParams({
        appkey: config.appKey,
        sid: config.sid,
        start_time: formatBeijingTime(input.startTime),
        end_time: formatBeijingTime(input.endTime),
        page_no: String(pageIndex),
        page_size: String(pageSize)
      });

      const response = await fetcher(config.apiUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
        body
      });
      if (!response.ok) {
        throw new Error(`Taobao order API HTTP ${response.status}`);
      }

      const text = await response.text();
      const payload = parsePayload(text);
      const status = Number(payload.status ?? payload.code ?? 0);
      if (status !== 200) {
        const msg = typeof payload.content === "string" ? payload.content : `error ${status}`;
        throw new Error(`Taobao order API: ${msg}`);
      }

      const items = Array.isArray(payload.content) ? payload.content as Record<string, unknown>[] : [];
      const orders = items.map(normalizeOrder).filter((o): o is TaobaoOrder => o !== null);

      const totalCount = Number(payload.total_count ?? 0);
      const hasNext = pageIndex * pageSize < totalCount;

      return { orders, hasNext };
    }
  };
}

function normalizeOrder(row: Record<string, unknown>): TaobaoOrder | null {
  const tradeId = String(row.trade_id ?? row.order_id ?? "").trim();
  const itemId = String(row.item_id ?? row.num_iid ?? "").trim();
  if (!tradeId || !itemId) return null;

  const tkStatus = Number(row.tk_status ?? 3);
  const payAmountCents = yuanToCents(row.alipay_total_price ?? row.pay_price);
  const estimatedFee = yuanToCents(row.pub_share_pre_fee ?? row.pub_share_fee);
  const settledFee = yuanToCents(row.pub_share_fee);

  return {
    tbkOrderId: tradeId,
    itemId,
    itemTitle: String(row.item_title ?? row.item_name ?? "淘宝商品"),
    payTime: parseTime(row.create_time) ?? new Date(),
    payAmountCents,
    estimatedCommissionCents: estimatedFee,
    settledCommissionCents: tkStatus === 12 ? settledFee : null,
    orderStatus: mapTkStatus(tkStatus),
    rawPayload: row
  };
}

// tk_status: 3=已付款 12=已收货/已结算 13=已失效
function mapTkStatus(status: number): string {
  if (status === 12) return "settled";
  if (status === 13) return "refunded";
  return "paid";
}

function yuanToCents(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function parseTime(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value).replace(" ", "T") + (String(value).includes("T") ? "" : "+08:00"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatBeijingTime(date: Date): string {
  const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())} ${pad(beijing.getUTCHours())}:${pad(beijing.getUTCMinutes())}:${pad(beijing.getUTCSeconds())}`;
}

function parsePayload(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { status: 0, content: text.slice(0, 100) };
  }
}
