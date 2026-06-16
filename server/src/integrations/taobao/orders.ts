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
    positionIndex?: string;
    pageSize?: number;
    // 查询时间类型：1创建 2付款 3结算 4更新；默认 4（按更新时间，能捕获收货/结算/退款状态变化）
    queryType?: number;
  }): Promise<{ orders: TaobaoOrder[]; hasNext: boolean; positionIndex?: string }>;
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
      const pageSize = input.pageSize ?? 100;

      const params = new URLSearchParams({
        appkey: config.appKey,
        sid: config.sid,
        start_time: formatBeijingTime(input.startTime),
        end_time: formatBeijingTime(input.endTime),
        query_type: String(input.queryType ?? 4),
        signurl: "1",
        page_size: String(pageSize),
        page_no: "1"
      });
      if (input.positionIndex) {
        params.set("position_index", input.positionIndex);
        params.delete("page_no");
      }

      const url = `${config.apiUrl}?${params.toString()}`;
      const response = await fetcher(url, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Taobao order API HTTP ${response.status}`);
      }

      const text = await response.text();
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error(`Taobao order API: ${text.slice(0, 100)}`);
      }

      // 旧式接口错误格式（status 字段）
      if ("status" in payload && Number(payload.status) !== 200) {
        const msg = typeof payload.content === "string" ? payload.content : `error ${String(payload.status)}`;
        throw new Error(`Taobao order API: ${msg}`);
      }

      // 新式接口格式：tbk_sc_order_details_get_response
      const resp = payload.tbk_sc_order_details_get_response as Record<string, unknown> | undefined;
      if (!resp) {
        throw new Error(`Taobao order API: unexpected response format`);
      }
      const data = resp.data as Record<string, unknown> | undefined;
      if (!data) {
        throw new Error(`Taobao order API: missing data`);
      }

      const results = data.results as Record<string, unknown> | undefined;
      const items = Array.isArray(results?.publisher_order_dto)
        ? (results.publisher_order_dto as Record<string, unknown>[])
        : [];

      const orders = items.map(normalizeOrder).filter((o): o is TaobaoOrder => o !== null);
      const hasNext = Boolean(data.has_next);
      const positionIndex = typeof data.position_index === "string" ? data.position_index : undefined;

      return { orders, hasNext, positionIndex };
    }
  };
}

function normalizeOrder(row: Record<string, unknown>): TaobaoOrder | null {
  const tradeId = String(row.trade_id ?? "").trim();
  const itemId = String(row.item_id ?? "").trim();
  if (!tradeId || !itemId) return null;

  const tkStatus = Number(row.tk_status ?? 12);
  const payAmountCents = yuanToCents(row.alipay_total_price ?? row.pay_price);
  const estimatedFee = yuanToCents(row.pub_share_pre_fee ?? row.tk_commission_pre_fee_for_media_platform);
  const settledFee = yuanToCents(row.pub_share_fee ?? row.tk_commission_fee_for_media_platform);

  return {
    tbkOrderId: tradeId,
    itemId,
    itemTitle: String(row.item_title ?? "淘宝商品"),
    payTime: parseTime(row.tb_paid_time ?? row.tk_paid_time ?? row.tk_create_time) ?? new Date(),
    payAmountCents,
    estimatedCommissionCents: estimatedFee,
    // tk_status 3 = 结算成功，其他状态未结算
    settledCommissionCents: tkStatus === 3 ? settledFee : null,
    orderStatus: mapTkStatus(tkStatus),
    rawPayload: row
  };
}

// 新接口 tk_status: 12=付款, 13=关闭, 14=确认收货, 3=结算成功
function mapTkStatus(status: number): string {
  if (status === 3) return "settled";
  if (status === 13) return "refunded";
  if (status === 14) return "received";
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
