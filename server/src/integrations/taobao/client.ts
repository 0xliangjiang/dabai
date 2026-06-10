import { createJdUnionClient, isJdUnionConfigured, type JdUnionClient } from "../jd/union.js";

export type ConversionPlatform = "taobao" | "jd" | "pdd" | "vip";

export type TaobaoConversionResult = {
  platform: ConversionPlatform;
  itemId: string;
  itemTitle: string;
  itemImageUrl: string;
  itemPriceCents: number;
  commissionRate: number;
  estimatedCommissionCents: number;
  generatedPassword: string;
  generatedShortUrl: string;
  generatedClickUrl: string;
};

export interface TaobaoClient {
  convert(rawContent: string): Promise<TaobaoConversionResult>;
}

export class ConversionApiError extends Error {
  readonly code?: number;

  constructor(message: string, options: { code?: number } = {}) {
    super(message);
    this.name = "ConversionApiError";
    this.code = options.code;
  }
}

// 平台暂未接入时抛出，路由层转为 400 提示
export class UnsupportedPlatformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedPlatformError";
  }
}

export type CreateTaobaoClientConfig = {
  zhetaokeApiUrl?: string;
  zhetaokeAppKey?: string;
  zhetaokeSid?: string;
  zhetaokePid?: string;
  zhetaokeRelationId?: string;
  zhetaokeJdApiUrl?: string;
  zhetaokeJdUnionId?: string;
  zhetaokeJdPositionId?: string;
  jdUnionAppKey?: string;
  jdUnionAppSecret?: string;
  jdUnionSiteId?: string;
  jdUnionPositionId?: string;
  jdUnionSceneId?: string;
};

type ZhetaokeClientConfig = {
  apiUrl: string;
  appKey: string;
  sid: string;
  pid: string;
  relationId: string;
  jdApiUrl: string;
  jdUnionId: string;
  jdPositionId: string;
};

type ClientDependencies = {
  fetch?: typeof fetch;
  jdUnion?: JdUnionClient;
};

// 折淘客万能转链（淘宝）+ 京东联盟官方
export class ZhetaokeClient implements TaobaoClient {
  private readonly fetch: typeof fetch;
  private readonly jdUnion?: JdUnionClient;

  constructor(
    private readonly config: ZhetaokeClientConfig,
    dependencies: ClientDependencies = {}
  ) {
    this.fetch = dependencies.fetch ?? fetch;
    this.jdUnion = dependencies.jdUnion;
  }

  async convert(rawContent: string): Promise<TaobaoConversionResult> {
    const platform = detectPlatform(rawContent);
    if (platform === "jd") {
      return isRealConfigValue(this.config.jdUnionId) ? this.convertJdViaZhetaoke(rawContent) : this.convertJd(rawContent);
    }
    if (platform === "pdd") {
      throw new UnsupportedPlatformError("拼多多转链暂未开通，敬请期待");
    }
    if (platform === "vip") {
      throw new UnsupportedPlatformError("唯品会转链暂未开通，敬请期待");
    }
    return this.convertTaobao(rawContent);
  }

  // 折淘客淘宝转链：老式淘口令走 tkl 接口；新版分享（e.tb.cn + tk=）解析出商品ID走高佣转链
  private async convertTaobao(rawContent: string): Promise<TaobaoConversionResult> {
    try {
      return await this.convertTaobaoByTkl(rawContent);
    } catch (error) {
      if (!(error instanceof ConversionApiError)) throw error;
      // 新版轻口令（e.tb.cn + tk=）暂无服务商支持解析，给出明确引导
      if (/e\.tb\.cn\/[^\s]+/.test(rawContent) && /[?&]tk=/.test(rawContent)) {
        throw new UnsupportedPlatformError(
          '暂不支持这种分享格式，请在淘宝分享时选择「复制口令」（￥￥格式）后再粘贴'
        );
      }
      const itemId = await this.resolveTaobaoItemId(rawContent);
      if (!itemId) throw error;
      return this.convertTaobaoByItemId(itemId);
    }
  }

  private async convertTaobaoByTkl(rawContent: string): Promise<TaobaoConversionResult> {
    const body = new URLSearchParams({
      appkey: this.config.appKey,
      sid: this.config.sid,
      pid: this.config.pid,
      tkl: rawContent,
      signurl: "5"
    });
    if (isRealConfigValue(this.config.relationId)) {
      body.set("relation_id", this.config.relationId);
    }
    const content = await this.postZhetaoke(this.config.apiUrl, body);
    return this.mapTaobaoContent(content, rawContent);
  }

  private async convertTaobaoByItemId(itemId: string): Promise<TaobaoConversionResult> {
    const body = new URLSearchParams({
      appkey: this.config.appKey,
      sid: this.config.sid,
      pid: this.config.pid,
      num_iid: itemId,
      signurl: "5"
    });
    if (isRealConfigValue(this.config.relationId)) {
      body.set("relation_id", this.config.relationId);
    }
    const gaoyongUrl = this.config.apiUrl.replace("open_gaoyongzhuanlian_tkl.ashx", "open_gaoyongzhuanlian.ashx");
    const content = await this.postZhetaoke(gaoyongUrl, body);
    return this.mapTaobaoContent(content, itemId);
  }

  // 新版淘宝分享短链（e.tb.cn/m.tb.cn）页面里带商品ID，自行解析
  private async resolveTaobaoItemId(rawContent: string): Promise<string> {
    const direct = rawContent.match(/[?&]id=(\d{8,})/);
    if (direct) return direct[1];
    const shortLink = rawContent.match(/https?:\/\/(?:e|m)\.tb\.cn\/[^\s，。"'<>]+/i)?.[0];
    if (!shortLink) return "";
    try {
      const response = await this.fetch(shortLink, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
        }
      });
      const html = await response.text();
      const match =
        html.match(/[?&]id=(\d{8,})/) ?? html.match(/itemId[=:"']+(\d{8,})/i) ?? html.match(/"id"\s*:\s*"?(\d{10,})/);
      return match?.[1] ?? "";
    } catch {
      return "";
    }
  }

  private async postZhetaoke(url: string, body: URLSearchParams): Promise<Record<string, unknown>> {
    const response = await this.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body
    });
    if (!response.ok) {
      throw new ConversionApiError(`Zhetaoke HTTP ${response.status}`);
    }
    const text = await response.text();
    // 折淘客偶发返回两段 JSON 拼接（如 转链失败 + 具体原因），取信息量更大的一段
    const payload = parseZhetaokePayload(text);
    const status = Number(payload.status ?? payload.code ?? 0);
    if (status !== 200) {
      const message =
        typeof payload.content === "string"
          ? payload.content
          : String(payload.msg ?? payload.message ?? "折淘客转链失败");
      throw new ConversionApiError(message, { code: status });
    }
    return Array.isArray(payload.content) ? asRecord(payload.content[0]) ?? {} : asRecord(payload.content) ?? {};
  }

  private mapTaobaoContent(content: Record<string, unknown>, fallbackId: string): TaobaoConversionResult {
    const priceCents = parseMoneyToCents(
      pickValue(content, ["quanhou_jiage", "quanhoujiage", "zk_final_price", "size", "price"])
    );
    const commissionRate = parsePercentRate(
      pickValue(content, ["max_commission_rate", "tkrate3", "commission_rate", "tkrate"])
    );

    return {
      platform: "taobao",
      itemId: pickString(content, ["tao_id", "item_id", "num_iid", "goods_id"]) || fallbackId,
      itemTitle: pickString(content, ["title", "tao_title", "goods_name"]) || "淘宝商品",
      itemImageUrl: pickString(content, ["pict_url", "pic_url"]),
      itemPriceCents: priceCents,
      commissionRate,
      estimatedCommissionCents: estimateCommissionCents(priceCents, commissionRate),
      generatedPassword: pickString(content, ["tkl", "taokouling", "long_tpwd", "tpwd"]),
      generatedShortUrl: pickString(content, ["shorturl", "short_url"]),
      generatedClickUrl: pickString(content, ["coupon_click_url", "item_url", "click_url", "url"])
    };
  }

  // 跟随最多 3 次重定向，返回最终落地 URL（失败时返回原始 URL）
  private async resolveRedirect(url: string): Promise<string> {
    let current = url;
    for (let i = 0; i < 3; i++) {
      try {
        const response = await this.fetch(current, { method: "GET", redirect: "manual" });
        const location = response.headers.get("location");
        if (!location) return current;
        current = new URL(location, current).toString();
        if (extractJdSkuId(current)) return current;
      } catch {
        return current;
      }
    }
    return current;
  }

  // 折淘客代理的京东转链（佣金归 unionId 对应的联盟账号）
  private async convertJdViaZhetaoke(rawContent: string): Promise<TaobaoConversionResult> {
    const materialUrl = extractJdMaterialId(rawContent);
    const body = new URLSearchParams({
      appkey: this.config.appKey,
      materialId: materialUrl,
      unionId: this.config.jdUnionId,
      chainType: "2"
    });
    if (isRealConfigValue(this.config.jdPositionId)) {
      body.set("positionId", this.config.jdPositionId);
    }

    const response = await this.fetch(this.config.jdApiUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body
    });
    if (!response.ok) {
      throw new ConversionApiError(`Zhetaoke JD HTTP ${response.status}`);
    }

    // 返回可能是折淘客包装 {status,content}，也可能直接透传京东 {jd_union_..._response:{getResult}}
    const payload = (await response.json()) as Record<string, unknown>;
    const data = extractZhetaokeJdData(payload);
    const clickUrl = pickString(data, ["clickURL", "clickUrl", "url"]);
    const shortUrl = pickString(data, ["shortURL", "shortUrl"]) || clickUrl;
    if (!clickUrl && !shortUrl) {
      const message = typeof payload.content === "string" ? payload.content : "京东转链失败";
      throw new ConversionApiError(message);
    }

    // 商品信息补全：优先折淘客响应自带，缺失且配置了官方密钥时再查官方
    let skuId = pickString(data, ["skuId", "sku_id"]) || extractJdSkuId(rawContent);
    if (!skuId && materialUrl) {
      skuId = extractJdSkuId(await this.resolveRedirect(materialUrl));
    }
    let goods: Record<string, unknown> = asRecord(pickValue(data, ["goodsInfo", "skuInfo"])) ?? {};
    if (Object.keys(goods).length === 0 && this.jdUnion && skuId) {
      goods = (await this.jdUnion.goodsQueryBySku(skuId)) ?? {};
    }
    const commissionInfo = asRecord(pickValue(goods, ["commissionInfo"])) ?? {};
    const priceInfo = asRecord(pickValue(goods, ["priceInfo"])) ?? {};
    const itemPriceCents = parseMoneyToCents(
      pickValue(priceInfo, ["lowestCouponPrice", "lowestPrice", "price"]) ??
        pickValue(goods, ["price", "lowestPrice"])
    );
    const commissionRate = parsePercentRate(
      pickValue(commissionInfo, ["commissionShare", "plusCommissionShare"]) ??
        pickValue(goods, ["commissionShare", "commission_rate"])
    );
    const estimatedCommissionCents =
      parseMoneyToCents(pickValue(commissionInfo, ["couponCommission", "commission"])) ||
      estimateCommissionCents(itemPriceCents, commissionRate);

    return {
      platform: "jd",
      itemId: skuId || materialUrl,
      itemTitle:
        pickString(goods, ["skuName", "goodsName", "title"]) || pickString(data, ["skuName", "goodsName"]) || "京东商品",
      itemImageUrl: pickJdImage(goods) || pickString(data, ["imageUrl", "imgUrl"]),
      itemPriceCents,
      commissionRate,
      estimatedCommissionCents,
      generatedPassword: "",
      generatedShortUrl: shortUrl,
      generatedClickUrl: clickUrl || shortUrl
    };
  }

  // 京东联盟官方 API 转链（免费）
  private async convertJd(rawContent: string): Promise<TaobaoConversionResult> {
    if (!this.jdUnion) {
      throw new UnsupportedPlatformError("京东转链未配置（缺少京东联盟密钥）");
    }
    // 2024-12 起京东要求用「联盟商品ID」转链：先 goods.query 取 itemId，再转链
    const materialUrl = extractJdMaterialId(rawContent);
    // 短链（3.cn/u.jd.com）里没有 SKU，跟随重定向解析出真实商品页再提取
    let skuId = extractJdSkuId(rawContent);
    if (!skuId && materialUrl) {
      skuId = extractJdSkuId(await this.resolveRedirect(materialUrl));
    }
    const goods = skuId ? (await this.jdUnion.goodsQueryBySku(skuId)) ?? {} : {};
    const unionItemId = pickString(goods, ["itemId", "unionItemId"]);
    const { clickUrl, shortUrl } = await this.jdUnion.promotionGet(unionItemId || materialUrl);
    const commissionInfo = asRecord(pickValue(goods, ["commissionInfo"])) ?? {};
    const priceInfo = asRecord(pickValue(goods, ["priceInfo"])) ?? {};
    const itemPriceCents = parseMoneyToCents(
      pickValue(priceInfo, ["lowestCouponPrice", "lowestPrice", "price"])
    );
    const commissionRate = parsePercentRate(
      pickValue(commissionInfo, ["commissionShare", "plusCommissionShare"])
    );
    const estimatedCommissionCents =
      parseMoneyToCents(pickValue(commissionInfo, ["couponCommission", "commission"])) ||
      estimateCommissionCents(itemPriceCents, commissionRate);

    return {
      platform: "jd",
      itemId: skuId || pickString(goods, ["skuId"]) || materialUrl,
      itemTitle: pickString(goods, ["skuName", "goodsName"]) || "京东商品",
      itemImageUrl: pickJdImage(goods),
      itemPriceCents,
      commissionRate,
      estimatedCommissionCents,
      generatedPassword: "",
      generatedShortUrl: shortUrl,
      generatedClickUrl: clickUrl
    };
  }
}

export function createTaobaoClient(config: CreateTaobaoClientConfig): TaobaoClient {
  const jdUnionConfig = {
    appKey: config.jdUnionAppKey ?? "",
    appSecret: config.jdUnionAppSecret ?? "",
    siteId: config.jdUnionSiteId ?? "",
    positionId: config.jdUnionPositionId,
    sceneId: config.jdUnionSceneId
  };
  const jdUnion = isJdUnionConfigured(jdUnionConfig) ? createJdUnionClient(jdUnionConfig) : undefined;

  if (isRealConfigValue(config.zhetaokeAppKey ?? "")) {
    return new ZhetaokeClient(
      {
        apiUrl: config.zhetaokeApiUrl ?? "https://api.zhetaoke.com:10001/api/open_gaoyongzhuanlian_tkl.ashx",
        appKey: config.zhetaokeAppKey!,
        sid: config.zhetaokeSid ?? "",
        pid: config.zhetaokePid ?? "",
        relationId: config.zhetaokeRelationId ?? "",
        jdApiUrl:
          config.zhetaokeJdApiUrl ??
          "https://api.zhetaoke.com:10001/api/open_jing_union_open_promotion_byunionid_get.ashx",
        jdUnionId: config.zhetaokeJdUnionId ?? "",
        jdPositionId: config.zhetaokeJdPositionId ?? ""
      },
      { jdUnion }
    );
  }

  return new MockTaobaoClient();
}

export class MockTaobaoClient implements TaobaoClient {
  async convert(_rawContent: string): Promise<TaobaoConversionResult> {
    return {
      platform: "taobao",
      itemId: "mock-item-100",
      itemTitle: "Mock Taobao Item",
      itemImageUrl: "https://img.alicdn.com/mock-item.png",
      itemPriceCents: 9900,
      commissionRate: 0.12,
      estimatedCommissionCents: 1188,
      generatedPassword: "￥mockpassword￥",
      generatedShortUrl: "https://s.click.taobao.com/mock",
      generatedClickUrl: "https://uland.taobao.com/mock"
    };
  }
}

// 折淘客偶发返回 "{...},{...}" 两段 JSON，取更具体的错误信息
function parseZhetaokePayload(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const parts = text
      .split(/\}\s*,\s*\{/)
      .map((part, index, arr) => {
        let fixed = part;
        if (index > 0) fixed = `{${fixed}`;
        if (index < arr.length - 1) fixed = `${fixed}}`;
        try {
          return JSON.parse(fixed) as Record<string, unknown>;
        } catch {
          return undefined;
        }
      })
      .filter(Boolean) as Record<string, unknown>[];
    return parts[parts.length - 1] ?? { status: 0, content: text.slice(0, 100) };
  }
}

// 折淘客京东接口响应解包：{status,content} 或透传的 jd_union_*_response.getResult
function extractZhetaokeJdData(payload: Record<string, unknown>): Record<string, unknown> {
  const direct = asRecord(payload.content) ?? asRecord(payload.data);
  if (direct) {
    return asRecord(direct.data) ?? direct;
  }
  for (const value of Object.values(payload)) {
    const wrapper = asRecord(value);
    if (!wrapper) continue;
    for (const [key, inner] of Object.entries(wrapper)) {
      if (key.toLowerCase().endsWith("result") && typeof inner === "string") {
        try {
          const parsed = JSON.parse(inner) as Record<string, unknown>;
          return asRecord(parsed.data) ?? parsed;
        } catch {
          continue;
        }
      }
    }
  }
  return {};
}

function detectPlatform(rawContent: string): ConversionPlatform {
  const lower = rawContent.toLowerCase();
  if (lower.includes("jd.com") || lower.includes("3.cn")) return "jd";
  if (lower.includes("yangkeduo.com") || lower.includes("pinduoduo.com") || lower.includes("pdd")) return "pdd";
  if (lower.includes("vip.com") || lower.includes("vipshop.com")) return "vip";
  return "taobao";
}

function extractJdSkuId(rawContent: string): string {
  const match = rawContent.match(/item(?:\.m)?\.jd\.com\/(?:product\/)?(\d{6,})\.html/i);
  return match?.[1] ?? "";
}

function extractJdMaterialId(rawContent: string): string {
  const match = rawContent.match(/https?:\/\/(?:u\.jd\.com|3\.cn|item\.jd\.com|item\.m\.jd\.com)\/[^\s，。"'<>]+/i);
  return match?.[0] ?? rawContent;
}

function isRealConfigValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && !trimmed.startsWith("replace-with-");
}

function pickValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function pickString(record: Record<string, unknown>, keys: string[]): string {
  const value = pickValue(record, keys);
  if (value === undefined) return "";
  return String(value);
}

function pickJdImage(goods: Record<string, unknown>): string {
  const imageInfo = asRecord(pickValue(goods, ["imageInfo"])) ?? {};
  const imageList = pickValue(imageInfo, ["imageList"]);
  if (Array.isArray(imageList)) {
    for (const image of imageList) {
      const imageRecord = asRecord(image);
      const url = imageRecord ? pickString(imageRecord, ["url"]) : "";
      if (url) return url;
    }
  }
  return pickString(goods, ["imageUrl", "imgUrl", "pictUrl"]);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function parseMoneyToCents(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

// "12.5"（百分比）→ 0.125；已是小数比例（<=1）时原样返回
function parsePercentRate(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 1 ? numeric / 100 : numeric;
}

function estimateCommissionCents(priceCents: number, rate: number): number {
  if (priceCents <= 0 || rate <= 0) return 0;
  return Math.round(priceCents * rate);
}
