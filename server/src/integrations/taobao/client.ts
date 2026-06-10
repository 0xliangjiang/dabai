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

export type CreateTaobaoClientConfig = {
  jdUnionAppKey?: string;
  jdUnionAppSecret?: string;
  jdUnionSiteId?: string;
  jdUnionPositionId?: string;
  dingdanxiaApiKey?: string;
  dingdanxiaApiUrl?: string;
  dingdanxiaPid?: string;
  dingdanxiaJdApiUrl?: string;
  dingdanxiaJdGoodsApiUrl?: string;
  dingdanxiaJdSiteId?: string;
  dingdanxiaJdUnionId?: string;
  dingdanxiaJdAuthKey?: string;
  dingdanxiaJdSceneId?: string;
  dingdanxiaJdPositionId?: string;
  dingdanxiaJdPid?: string;
  dingdanxiaPddApiUrl?: string;
  dingdanxiaPddPid?: string;
  dingdanxiaPddCustomParameters?: string;
  dingdanxiaVipApiUrl?: string;
  dingdanxiaVipChanTag?: string;
  dingdanxiaVipStatParam?: string;
};

type DingdanxiaClientDependencies = {
  fetch?: typeof fetch;
  jdUnion?: JdUnionClient;
};

export class DingdanxiaApiError extends Error {
  readonly code?: number;

  constructor(message: string, options: { code?: number } = {}) {
    super(message);
    this.name = "DingdanxiaApiError";
    this.code = options.code;
  }
}

export type DingdanxiaClientConfig = {
  apiKey: string;
  apiUrl: string;
  pid?: string;
  jdApiUrl: string;
  jdGoodsApiUrl: string;
  jdSiteId?: string;
  jdUnionId?: string;
  jdAuthKey?: string;
  jdSceneId?: string;
  jdPositionId?: string;
  jdPid?: string;
  pddApiUrl: string;
  pddPid?: string;
  pddCustomParameters?: string;
  vipApiUrl: string;
  vipChanTag?: string;
  vipStatParam?: string;
};

type DingdanxiaConvertResponse = {
  code: number;
  msg?: string;
  data?: {
    item_id?: number | string;
    item_url?: string;
    coupon_click_url?: string;
    item_tpwd?: string;
    coupon_tpwd?: string;
    long_item_tpwd?: string;
    long_coupon_tpwd?: string;
    max_commission_rate?: string | number;
    itemInfo?: {
      title?: string;
      pict_url?: string;
      zk_final_price?: string | number;
      qh_final_price?: string | number;
    };
  };
};

type DingdanxiaGenericResponse = {
  code: number;
  msg?: string;
  data?: Record<string, unknown>;
};

export class DingdanxiaClient implements TaobaoClient {
  private readonly fetch: typeof fetch;
  private readonly jdUnion?: JdUnionClient;

  constructor(
    private readonly config: DingdanxiaClientConfig,
    dependencies: DingdanxiaClientDependencies = {}
  ) {
    this.fetch = dependencies.fetch ?? fetch;
    this.jdUnion = dependencies.jdUnion;
  }

  async convert(rawContent: string): Promise<TaobaoConversionResult> {
    const platform = detectPlatform(rawContent);
    if (platform === "jd") return this.convertJd(rawContent);
    if (platform === "pdd") return this.convertPdd(rawContent);
    if (platform === "vip") return this.convertVip(rawContent);
    return this.convertTaobao(rawContent);
  }

  private async convertTaobao(rawContent: string): Promise<TaobaoConversionResult> {
    const body = new URLSearchParams({
      apikey: this.config.apiKey,
      content: rawContent
    });
    if (this.config.pid) {
      body.set("pid", this.config.pid);
    }

    const response = await this.fetch(this.config.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=utf-8"
      },
      body
    });

    if (!response.ok) {
      throw new DingdanxiaApiError(`Dingdanxia HTTP ${response.status}`);
    }

    const payload = (await response.json()) as DingdanxiaConvertResponse;
    if (payload.code !== 200) {
      throw new DingdanxiaApiError(payload.msg ?? "Dingdanxia API error", {
        code: payload.code
      });
    }

    if (!payload.data) {
      throw new DingdanxiaApiError("Dingdanxia response missing conversion data", {
        code: payload.code
      });
    }

    const data = payload.data;
    const itemInfo = data.itemInfo ?? {};
    const finalPrice = parseMoneyToCents(itemInfo.qh_final_price ?? itemInfo.zk_final_price);
    const commissionRate = parsePercentRate(data.max_commission_rate);

    return {
      platform: "taobao",
      itemId: String(data.item_id ?? ""),
      itemTitle: itemInfo.title ?? `Taobao item ${data.item_id ?? "unknown"}`,
      itemImageUrl: itemInfo.pict_url ?? "",
      itemPriceCents: finalPrice,
      commissionRate,
      estimatedCommissionCents: estimateCommissionCents(finalPrice, commissionRate),
      generatedPassword: data.long_coupon_tpwd ?? data.long_item_tpwd ?? data.coupon_tpwd ?? data.item_tpwd ?? "",
      generatedShortUrl: "",
      generatedClickUrl: data.coupon_click_url ?? data.item_url ?? ""
    };
  }

  private async convertJd(rawContent: string): Promise<TaobaoConversionResult> {
    if (this.jdUnion) {
      return this.convertJdViaUnion(rawContent);
    }
    const siteId = this.config.jdSiteId || this.config.jdUnionId;
    const unionId = this.config.jdUnionId || this.config.jdSiteId;
    if (!isRealConfigValue(siteId ?? "")) {
      throw new DingdanxiaApiError("DINGDANXIA_JD_SITE_ID is required for JD conversion");
    }

    const materialId = extractJdMaterialId(rawContent);
    const body = new URLSearchParams({
      apikey: this.config.apiKey,
      materialId,
      siteId: siteId!
    });
    if (isRealConfigValue(unionId ?? "")) body.set("unionId", unionId!);
    if (isRealConfigValue(this.config.jdAuthKey ?? "")) body.set("key", this.config.jdAuthKey!);
    if (isRealConfigValue(this.config.jdSceneId ?? "")) body.set("sceneId", this.config.jdSceneId!);
    if (isRealConfigValue(this.config.jdPositionId ?? "")) body.set("positionId", this.config.jdPositionId!);
    if (isRealConfigValue(this.config.jdPid ?? "")) body.set("pid", this.config.jdPid!);

    const [data, goods] = await Promise.all([
      this.postGeneric(this.config.jdApiUrl, body),
      this.queryJdGoods(materialId)
    ]);
    const clickUrl = pickString(data, ["clickURL", "clickUrl", "shortURL", "shortUrl", "url"]);
    const commissionInfo = asRecord(pickValue(goods, ["commissionInfo"])) ?? {};
    const priceInfo = asRecord(pickValue(goods, ["priceInfo"])) ?? {};
    const itemId = pickString(goods, ["itemId", "skuId", "sku_id", "goodsId"]) || pickString(data, ["skuId", "sku_id", "goodsId", "itemId"]);
    const itemPriceCents = parseMoneyToCents(
      pickValue(priceInfo, ["lowestCouponPrice", "lowestPrice", "price"]) ??
        pickValue(goods, ["price", "wlPrice", "lowestPrice"]) ??
        pickValue(data, ["price", "wlPrice", "lowestPrice"])
    );
    const commissionRate = parsePercentRate(
      pickValue(commissionInfo, ["commissionShare", "plusCommissionShare"]) ??
        pickValue(goods, ["commisionRatioWl", "commissionRate", "commissionShare"]) ??
        pickValue(data, ["commisionRatioWl", "commissionRate", "commissionShare"])
    );
    const estimatedCommissionCents =
      parseMoneyToCents(pickValue(commissionInfo, ["couponCommission", "commission"])) ||
      estimateCommissionCents(itemPriceCents, commissionRate);

    return {
      platform: "jd",
      itemId: itemId || rawContent,
      itemTitle: pickString(goods, ["skuName", "goodsName", "title", "itemTitle"]) || pickString(data, ["skuName", "goodsName", "title", "itemTitle"]) || "京东商品",
      itemImageUrl: pickJdImage(goods) || pickString(data, ["imageUrl", "imgUrl", "pictUrl"]),
      itemPriceCents,
      commissionRate,
      estimatedCommissionCents,
      generatedPassword: "",
      generatedShortUrl: clickUrl,
      generatedClickUrl: clickUrl
    };
  }

  // 京东联盟官方 API 转链（免费），商品详情查询失败不阻断
  private async convertJdViaUnion(rawContent: string): Promise<TaobaoConversionResult> {
    const materialId = extractJdMaterialId(rawContent);
    const { clickUrl, shortUrl } = await this.jdUnion!.promotionGet(materialId);

    const skuId = extractJdSkuId(rawContent);
    const goods = skuId ? (await this.jdUnion!.goodsQueryBySku(skuId)) ?? {} : {};
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

  private async convertPdd(rawContent: string): Promise<TaobaoConversionResult> {
    if (!isRealConfigValue(this.config.pddPid ?? "")) {
      throw new DingdanxiaApiError("DINGDANXIA_PDD_PID is required for PDD conversion");
    }

    const body = new URLSearchParams({
      apikey: this.config.apiKey,
      source_url: rawContent,
      pid: this.config.pddPid!,
      custom_parameters: this.config.pddCustomParameters || "{\"uid\":\"default\"}",
      itemInfo: "true"
    });

    const data = await this.postGeneric(this.config.pddApiUrl, body);
    const itemInfo = asRecord(pickValue(data, ["itemInfo"])) ?? {};
    const clickUrl = pickString(data, ["mobile_url", "url", "short_url", "we_app_web_view_url", "we_app_page_path"]);
    const itemId = pickString(itemInfo, ["goods_id", "goodsId"]) || pickString(data, ["goods_id", "goodsId", "item_id", "itemId"]);

    return {
      platform: "pdd",
      itemId: itemId || rawContent,
      itemTitle: pickString(itemInfo, ["goods_name", "goodsName", "title"]) || pickString(data, ["goods_name", "goodsName", "title"]) || "拼多多商品",
      itemImageUrl: pickString(itemInfo, ["goods_thumbnail_url", "goods_image_url", "imageUrl"]) || pickString(data, ["goods_thumbnail_url", "goods_image_url", "imageUrl"]),
      itemPriceCents: parseFenToCents(pickValue(itemInfo, ["min_group_price", "min_normal_price"])) || parseMoneyToCents(pickValue(data, ["price"])),
      commissionRate: parsePermillageRate(pickValue(itemInfo, ["promotion_rate", "predict_promotion_rate"]) ?? pickValue(data, ["promotion_rate", "commission_rate", "commissionRate"])),
      estimatedCommissionCents: estimateCommissionCents(
        parseFenToCents(pickValue(itemInfo, ["min_group_price", "min_normal_price"])) || parseMoneyToCents(pickValue(data, ["price"])),
        parsePermillageRate(pickValue(itemInfo, ["promotion_rate", "predict_promotion_rate"]) ?? pickValue(data, ["promotion_rate", "commission_rate", "commissionRate"]))
      ),
      generatedPassword: "",
      generatedShortUrl: pickString(data, ["short_url", "mobile_short_url"]),
      generatedClickUrl: clickUrl
    };
  }

  private async convertVip(rawContent: string): Promise<TaobaoConversionResult> {
    const body = new URLSearchParams({
      apikey: this.config.apiKey,
      url: rawContent,
      itemInfo: "true"
    });
    if (isRealConfigValue(this.config.vipChanTag ?? "")) body.set("chanTag", this.config.vipChanTag!);
    if (isRealConfigValue(this.config.vipStatParam ?? "")) body.set("statParam", this.config.vipStatParam!);

    const data = await this.postGeneric(this.config.vipApiUrl, body);
    const itemInfo = asRecord(pickValue(data, ["itemInfo", "goodsInfo", "item_info"])) ?? {};
    const clickUrl = pickString(data, ["url", "shortUrl", "deeplinkUrl", "longUrl"]);
    const itemId = pickString(itemInfo, ["goodsId", "goods_id", "itemId"]) || pickString(data, ["goodsId", "itemId"]);

    return {
      platform: "vip",
      itemId: itemId || rawContent,
      itemTitle: pickString(itemInfo, ["goodsName", "title", "itemTitle"]) || pickString(data, ["goodsName", "title"]) || "唯品会商品",
      itemImageUrl: pickString(itemInfo, ["goodsThumbUrl", "imageUrl", "goodsImageUrl"]) || pickString(data, ["imageUrl"]),
      itemPriceCents: parseMoneyToCents(pickValue(itemInfo, ["vipPrice", "price", "marketPrice"])),
      commissionRate: parsePercentRate(pickValue(data, ["commissionRate", "commRate"])),
      estimatedCommissionCents: estimateCommissionCents(
        parseMoneyToCents(pickValue(itemInfo, ["vipPrice", "price", "marketPrice"])),
        parsePercentRate(pickValue(data, ["commissionRate", "commRate"]))
      ),
      generatedPassword: "",
      generatedShortUrl: pickString(data, ["shortUrl"]),
      generatedClickUrl: clickUrl
    };
  }

  private async queryJdGoods(materialId: string): Promise<Record<string, unknown>> {
    const body = new URLSearchParams({
      apikey: this.config.apiKey,
      keyword: materialId,
      pageIndex: "1",
      pageSize: "1"
    });
    if (isRealConfigValue(this.config.jdSceneId ?? "")) body.set("sceneId", this.config.jdSceneId!);
    if (isRealConfigValue(this.config.jdPid ?? "")) body.set("pid", this.config.jdPid!);

    try {
      const data = await this.postGeneric(this.config.jdGoodsApiUrl, body);
      return firstRecord(data) ?? data;
    } catch {
      return {};
    }
  }

  private async postGeneric(url: string, body: URLSearchParams): Promise<Record<string, unknown>> {
    const response = await this.fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=utf-8"
      },
      body
    });

    if (!response.ok) {
      throw new DingdanxiaApiError(`Dingdanxia HTTP ${response.status}`);
    }

    const payload = (await response.json()) as DingdanxiaGenericResponse;
    if (payload.code !== 200) {
      throw new DingdanxiaApiError(payload.msg ?? "Dingdanxia API error", {
        code: payload.code
      });
    }
    if (!payload.data) {
      throw new DingdanxiaApiError("Dingdanxia response missing conversion data", {
        code: payload.code
      });
    }

    return payload.data;
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

  if (isRealConfigValue(config.dingdanxiaApiKey ?? "")) {
    return new DingdanxiaClient({
      apiKey: config.dingdanxiaApiKey!,
      apiUrl: config.dingdanxiaApiUrl ?? "https://api.tbk.dingdanxia.com/tbk/wn_convert",
      pid: config.dingdanxiaPid,
      jdApiUrl: config.dingdanxiaJdApiUrl ?? "https://api.tbk.dingdanxia.com/jd/promotion_common",
      jdGoodsApiUrl: config.dingdanxiaJdGoodsApiUrl ?? "https://api.tbk.dingdanxia.com/jd/query_goods",
      jdSiteId: config.dingdanxiaJdSiteId,
      jdUnionId: config.dingdanxiaJdUnionId,
      jdAuthKey: config.dingdanxiaJdAuthKey,
      jdSceneId: config.dingdanxiaJdSceneId,
      jdPositionId: config.dingdanxiaJdPositionId,
      jdPid: config.dingdanxiaJdPid,
      pddApiUrl: config.dingdanxiaPddApiUrl ?? "https://api.tbk.dingdanxia.com/pdd/url_convert",
      pddPid: config.dingdanxiaPddPid,
      pddCustomParameters: config.dingdanxiaPddCustomParameters,
      vipApiUrl: config.dingdanxiaVipApiUrl ?? "https://api.tbk.dingdanxia.com/vip/url_privilege",
      vipChanTag: config.dingdanxiaVipChanTag,
      vipStatParam: config.dingdanxiaVipStatParam
    }, { jdUnion });
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

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const itemRecord = asRecord(item);
      if (itemRecord) return itemRecord;
    }
    return undefined;
  }

  const record = asRecord(value);
  if (!record) return undefined;

  const numericKeyRecord = asRecord(record["0"]);
  if (numericKeyRecord) return numericKeyRecord;

  const candidates = [
    pickValue(record, ["data"]),
    pickValue(record, ["list"]),
    pickValue(record, ["result"]),
    pickValue(record, ["goodsList"])
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const [first] = candidate;
      const firstAsRecord = asRecord(first);
      if (firstAsRecord) return firstAsRecord;
    }

    const candidateRecord = asRecord(candidate);
    if (candidateRecord) {
      const nested = firstRecord(candidateRecord);
      if (nested) return nested;
    }
  }

  return undefined;
}

function pickJdImage(goods: Record<string, unknown>): string {
  const imageInfo = asRecord(pickValue(goods, ["imageInfo"])) ?? {};
  const imageList = pickValue(imageInfo, ["imageList"]);
  if (Array.isArray(imageList)) {
    for (const image of imageList) {
      const imageRecord = asRecord(image);
      if (!imageRecord) continue;
      const url = pickString(imageRecord, ["url", "imageUrl"]);
      if (url) return url;
    }
  }

  return pickString(goods, ["imageUrl", "imgUrl", "pictUrl"]);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function parseMoneyToCents(value: unknown): number {
  if (value === undefined || value === "") {
    return 0;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount * 100);
}

function parseFenToCents(value: unknown): number {
  if (value === undefined || value === "") {
    return 0;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round(amount);
}

function parsePercentRate(value: unknown): number {
  if (value === undefined || value === "") {
    return 0;
  }

  const percent = Number(value);
  if (!Number.isFinite(percent)) {
    return 0;
  }

  return percent / 100;
}

function parsePermillageRate(value: unknown): number {
  if (value === undefined || value === "") {
    return 0;
  }
  const rate = Number(value);
  if (!Number.isFinite(rate)) {
    return 0;
  }
  return rate > 100 ? rate / 1000 : rate / 100;
}

function estimateCommissionCents(priceCents: number, commissionRate: number): number {
  return Math.round(priceCents * commissionRate);
}
