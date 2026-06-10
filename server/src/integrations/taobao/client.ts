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
  jdUnionAppKey?: string;
  jdUnionAppSecret?: string;
  jdUnionSiteId?: string;
  jdUnionPositionId?: string;
};

type ZhetaokeClientConfig = {
  apiUrl: string;
  appKey: string;
  sid: string;
  pid: string;
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
    if (platform === "jd") return this.convertJd(rawContent);
    if (platform === "pdd") {
      throw new UnsupportedPlatformError("拼多多转链暂未开通，敬请期待");
    }
    if (platform === "vip") {
      throw new UnsupportedPlatformError("唯品会转链暂未开通，敬请期待");
    }
    return this.convertTaobao(rawContent);
  }

  // 折淘客万能转链：支持淘口令、链接、分享文案
  private async convertTaobao(rawContent: string): Promise<TaobaoConversionResult> {
    const body = new URLSearchParams({
      appkey: this.config.appKey,
      sid: this.config.sid,
      pid: this.config.pid,
      tkl: rawContent,
      signurl: "5"
    });

    const response = await this.fetch(this.config.apiUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body
    });
    if (!response.ok) {
      throw new ConversionApiError(`Zhetaoke HTTP ${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const status = Number(payload.status ?? payload.code ?? 0);
    if (status !== 200) {
      const message =
        typeof payload.content === "string"
          ? payload.content
          : String(payload.msg ?? payload.message ?? "折淘客转链失败");
      throw new ConversionApiError(message, { code: status });
    }

    const content = Array.isArray(payload.content)
      ? asRecord(payload.content[0]) ?? {}
      : asRecord(payload.content) ?? {};
    const priceCents = parseMoneyToCents(
      pickValue(content, ["quanhou_jiage", "quanhoujiage", "zk_final_price", "size", "price"])
    );
    const commissionRate = parsePercentRate(
      pickValue(content, ["max_commission_rate", "tkrate3", "commission_rate", "tkrate"])
    );

    return {
      platform: "taobao",
      itemId: pickString(content, ["tao_id", "item_id", "num_iid", "goods_id"]) || rawContent,
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

  // 京东联盟官方 API 转链（免费）
  private async convertJd(rawContent: string): Promise<TaobaoConversionResult> {
    if (!this.jdUnion) {
      throw new UnsupportedPlatformError("京东转链未配置（缺少京东联盟密钥）");
    }
    const materialId = extractJdMaterialId(rawContent);
    const { clickUrl, shortUrl } = await this.jdUnion.promotionGet(materialId);

    const skuId = extractJdSkuId(rawContent);
    const goods = skuId ? (await this.jdUnion.goodsQueryBySku(skuId)) ?? {} : {};
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
      itemId: skuId || pickString(goods, ["skuId"]) || materialId,
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
    positionId: config.jdUnionPositionId
  };
  const jdUnion = isJdUnionConfigured(jdUnionConfig) ? createJdUnionClient(jdUnionConfig) : undefined;

  if (isRealConfigValue(config.zhetaokeAppKey ?? "")) {
    return new ZhetaokeClient(
      {
        apiUrl: config.zhetaokeApiUrl ?? "https://api.zhetaoke.com:10001/api/open_gaoyongzhuanlian_tkl.ashx",
        appKey: config.zhetaokeAppKey!,
        sid: config.zhetaokeSid ?? "",
        pid: config.zhetaokePid ?? ""
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
