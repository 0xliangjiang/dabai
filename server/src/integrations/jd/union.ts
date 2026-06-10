import { createHash } from "node:crypto";

// 京东联盟官方开放平台（宙斯网关）客户端
// 文档：https://union.jd.com/openplatform

const GATEWAY_URL = "https://api.jd.com/routerjson";
const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export type JdUnionConfig = {
  appKey: string;
  appSecret: string;
  siteId: string;
  positionId?: string;
};

export class JdUnionApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JdUnionApiError";
  }
}

export type JdUnionClient = {
  /** jd.union.open.promotion.common.get：转链 */
  promotionGet(materialId: string): Promise<{ clickUrl: string; shortUrl: string }>;
  /** jd.union.open.goods.query：按 skuId 查商品详情（失败返回 undefined，不阻断转链） */
  goodsQueryBySku(skuId: string): Promise<Record<string, unknown> | undefined>;
  /** jd.union.open.order.row.query：订单行查询（type=3 按更新时间） */
  orderRowQuery(input: {
    startTime: Date;
    endTime: Date;
    pageIndex?: number;
    pageSize?: number;
  }): Promise<{ rows: Record<string, unknown>[]; hasMore: boolean }>;
};

export function isJdUnionConfigured(config: Partial<JdUnionConfig>): config is JdUnionConfig {
  return Boolean(
    isReal(config.appKey ?? "") && isReal(config.appSecret ?? "") && isReal(config.siteId ?? "")
  );
}

export function createJdUnionClient(config: JdUnionConfig, fetcher: typeof fetch = fetch): JdUnionClient {
  async function call(method: string, bizParams: Record<string, unknown>): Promise<Record<string, unknown>> {
    const sysParams: Record<string, string> = {
      method,
      app_key: config.appKey,
      timestamp: beijingTimestamp(new Date()),
      format: "json",
      v: "1.0",
      sign_method: "md5",
      "360buy_param_json": JSON.stringify(bizParams)
    };
    sysParams.sign = signParams(sysParams, config.appSecret);

    const response = await fetcher(GATEWAY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams(sysParams)
    });
    if (!response.ok) {
      throw new JdUnionApiError(`JD union HTTP ${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const errorResponse = payload.error_response as { zh_desc?: string; msg?: string } | undefined;
    if (errorResponse) {
      throw new JdUnionApiError(`JD union gateway error: ${errorResponse.zh_desc ?? errorResponse.msg ?? "unknown"}`);
    }

    // 响应外层 key 形如 jd_union_open_promotion_common_get_responce，
    // 内部某个 *Result 字段是 JSON 字符串
    const wrapper = Object.values(payload).find((value) => value && typeof value === "object") as
      | Record<string, unknown>
      | undefined;
    if (!wrapper) {
      throw new JdUnionApiError("JD union response missing wrapper");
    }
    const resultString = Object.entries(wrapper).find(
      ([key, value]) => key.toLowerCase().endsWith("result") && typeof value === "string"
    )?.[1] as string | undefined;
    if (!resultString) {
      throw new JdUnionApiError("JD union response missing result payload");
    }

    const result = JSON.parse(resultString) as { code?: number; message?: string } & Record<string, unknown>;
    if (Number(result.code) !== 200) {
      throw new JdUnionApiError(`JD union API error ${result.code}: ${result.message ?? "unknown"}`);
    }
    return result;
  }

  return {
    async promotionGet(materialId: string) {
      const promotionCodeReq: Record<string, unknown> = {
        materialId,
        siteId: config.siteId
      };
      if (isReal(config.positionId ?? "")) {
        promotionCodeReq.positionId = Number(config.positionId);
      }
      const result = await call("jd.union.open.promotion.common.get", { promotionCodeReq });
      const data = (result.data ?? {}) as Record<string, unknown>;
      return {
        clickUrl: String(data.clickURL ?? ""),
        shortUrl: String(data.shortURL ?? data.clickURL ?? "")
      };
    },

    async goodsQueryBySku(skuId: string) {
      try {
        const result = await call("jd.union.open.goods.query", {
          goodsReqDTO: { skuIds: [Number(skuId)] }
        });
        const data = result.data;
        if (Array.isArray(data) && data.length > 0) {
          return data[0] as Record<string, unknown>;
        }
        return undefined;
      } catch {
        return undefined;
      }
    },

    async orderRowQuery(input) {
      const result = await call("jd.union.open.order.row.query", {
        orderReq: {
          pageIndex: input.pageIndex ?? 1,
          pageSize: input.pageSize ?? 100,
          type: 3,
          startTime: beijingTimestamp(input.startTime),
          endTime: beijingTimestamp(input.endTime)
        }
      });
      const rows = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
      return { rows, hasMore: Boolean(result.hasMore) };
    }
  };
}

// 京东签名：MD5(secret + 按 key 排序的 k+v 拼接 + secret)，大写十六进制
export function signParams(params: Record<string, string>, secret: string): string {
  const concatenated = Object.keys(params)
    .filter((key) => key !== "sign" && params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
  return createHash("md5").update(`${secret}${concatenated}${secret}`, "utf8").digest("hex").toUpperCase();
}

// 网关要求北京时间 yyyy-MM-dd HH:mm:ss
export function beijingTimestamp(date: Date): string {
  const beijing = new Date(date.getTime() + CHINA_UTC_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())} ${pad(
    beijing.getUTCHours()
  )}:${pad(beijing.getUTCMinutes())}:${pad(beijing.getUTCSeconds())}`;
}

function isReal(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && !trimmed.startsWith("replace-with-");
}
