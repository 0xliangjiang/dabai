import { createJdUnionClient, isJdUnionConfigured, type JdUnionClient } from "../jd/union.js";
import { fetchWithTimeout } from "../http.js";

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
  zhetaokeJdItemInfoUrl?: string;
  zhetaokeJdBigFieldUrl?: string;
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
  jdItemInfoUrl: string;
  jdBigFieldUrl: string;
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
    // 统一套超时：转链是用户高频接口，第三方挂起会卡死请求（默认 20s）
    const baseFetch = dependencies.fetch ?? fetch;
    this.fetch = ((url: string | URL, init?: RequestInit) => fetchWithTimeout(baseFetch, url, init)) as typeof fetch;
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
    let tklError: Error | undefined;
    try {
      const result = await this.convertTaobaoByTkl(rawContent);
      // 只要折淘客返回了真实商品（有标题）即视为成功——新版加密商品 id 是不稳定 token，
      // itemId 可能为空，归因改走「商品标题」匹配，不能因没有数字 id 就当失败。
      if (result.itemTitle && result.itemTitle !== "淘宝商品") return result;
    } catch (error) {
      if (!(error instanceof ConversionApiError)) throw error;
      tklError = error;
    }
    // 先尝试从短链（包括 e.tb.cn?tk= 新版分享）解析商品 ID
    const itemId = await this.resolveTaobaoItemId(rawContent);
    if (itemId) return this.convertTaobaoByItemId(itemId);
    // 仍无法解析时，对新版轻口令/价保链接给出明确引导
    if (/e\.tb\.cn\/[^\s]+/.test(rawContent) && /[?&]tk=/.test(rawContent)) {
      throw new UnsupportedPlatformError(
        '暂不支持这种分享格式，请在淘宝 App 商品页选择「分享 → 复制口令」（￥￥ 格式）后再粘贴'
      );
    }
    throw tklError ?? new ConversionApiError("未能识别该商品，请换商品口令重试");
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
    let shortLink = rawContent.match(/https?:\/\/(?:e|m)\.tb\.cn\/[^\s，。"'<>]+/i)?.[0];
    if (!shortLink) return "";
    // 价保链接（?tk=）跟随重定向会落到需要登录的页面，去掉 tk 参数直接跳商品页
    shortLink = shortLink.replace(/[?&]tk=[^&\s]*/g, "").replace(/[?&]$/, "").replace(/\?&/, "?");
    try {
      const response = await this.fetch(shortLink, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
        }
      });
      // 先检查重定向后的最终 URL（很多短链直接在 URL 里带 id=）
      const finalUrlMatch = response.url?.match(/[?&]id=(\d{8,})/);
      if (finalUrlMatch) return finalUrlMatch[1];
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
    // 诊断日志：打出折淘客原始返回（截断），便于排查转链/查券为空的问题（docker logs 可查）
    console.log(`[ztk-convert] resp=${text.slice(0, 800)}`);
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
      // itemId 必须是数字商品 id（要与订单接口的 item_id 对齐才能归因）；
      // 新版加密 tao_id 是不稳定 token，会被过滤为空，归因改走标题
      itemId: extractNumericItemId(content, fallbackId),
      // 优先用完整标题：折淘客 title 常被截断，jianjie 多为完整商品名，
      // 用完整名与订单标题对齐，标题归因最准
      itemTitle: pickFullTitle(content),
      itemImageUrl: ensureHttps(pickString(content, ["pict_url", "pic_url"])),
      itemPriceCents: priceCents,
      commissionRate,
      estimatedCommissionCents: estimateCommissionCents(priceCents, commissionRate),
      generatedPassword: pickString(content, ["tkl", "taokouling", "long_tpwd", "tpwd"]),
      generatedShortUrl: pickString(content, ["shorturl", "short_url"]),
      generatedClickUrl: pickString(content, ["coupon_click_url", "item_url", "click_url", "url"])
    };
  }

  // 跟随重定向取最终落地 URL；fetch 的 redirect:"manual" 读不到 Location（不透明响应），
  // 故用默认 follow + response.url，并带移动端 UA（京东短链对 UA 敏感）。
  // 最终 URL 不含 skuId 时再从页面 HTML 里抠，合成 item URL 返回，便于上层 extractJdSkuId。
  private async resolveRedirect(url: string): Promise<string> {
    try {
      const response = await this.fetch(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
        }
      });
      const finalUrl = response.url || url;
      if (extractJdSkuId(finalUrl)) return finalUrl;
      const html = await response.text();
      const m =
        html.match(/item\.jd\.com\/(\d{6,})\.html/i) ??
        html.match(/["'](?:skuId|wareId)["']\s*:\s*["']?(\d{6,})/i) ??
        html.match(/(?:skuId|wareId)=(\d{6,})/i);
      console.log(`[ztk-jd] redirect status=${response.status} finalUrl=${finalUrl} html=${html.slice(0, 300)}`);
      return m ? `https://item.jd.com/${m[1]}.html` : finalUrl;
    } catch {
      return url;
    }
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
    // 诊断日志：打印折淘客京东转链原始返回，确认是否带商品详情/佣金（docker logs 可查）
    console.log(`[ztk-jd] resp=${JSON.stringify(payload).slice(0, 1000)}`);
    const data = extractZhetaokeJdData(payload);
    const clickUrl = pickString(data, ["clickURL", "clickUrl", "url"]);
    const shortUrl = pickString(data, ["shortURL", "shortUrl"]) || clickUrl;
    if (!clickUrl && !shortUrl) {
      const message = typeof payload.content === "string" ? payload.content : "京东转链失败";
      throw new ConversionApiError(message);
    }

    // 商品信息补全：折淘客 bigfield 接口 content 可直接传短链/口令/skuId，
    // 由折淘客解析出 skuId + 标题 + 图（绕开短链自行重定向解析不出 skuId 的问题）
    let skuId = pickString(data, ["skuId", "sku_id"]) || extractJdSkuId(rawContent);
    // content 优先用 skuId；否则用口令(转链能解析的那个)，最后才短链——u.jd.com 短链常不被详情接口接受
    const detailContent = skuId || materialUrl || shortUrl || rawContent;
    let goods: Record<string, unknown> = await this.fetchJdBigField(detailContent);
    if (!skuId) skuId = pickString(goods, ["skuId", "mainSkuId", "productId"]);

    // 价格/佣金：bigfield 不含，按 skuId 再查 open_item_info3 补全（标题/图以 bigfield 为准）
    if (skuId) {
      const priceGoods = await this.fetchJdItemInfo(skuId);
      goods = { ...priceGoods, ...goods };
    }
    if (Object.keys(goods).length === 0 && this.jdUnion && skuId) {
      goods = (await this.jdUnion.goodsQueryBySku(skuId)) ?? {};
    }
    const commissionInfo = asRecord(pickValue(goods, ["commissionInfo"])) ?? {};
    const priceInfo = asRecord(pickValue(goods, ["priceInfo"])) ?? {};
    // 价格/佣金：同时兼容官方联盟(嵌套)与折淘客(扁平)两种字段命名
    const itemPriceCents = parseMoneyToCents(
      pickValue(priceInfo, ["lowestCouponPrice", "lowestPrice", "price"]) ??
        pickValue(goods, ["quanhou_jiage", "quanhoujiage", "price", "lowestPrice", "zk_final_price"])
    );
    const commissionRate = parsePercentRate(
      pickValue(commissionInfo, ["commissionShare", "plusCommissionShare"]) ??
        pickValue(goods, ["commissionShare", "commission_rate", "tkrate3", "yongjin_bili", "commissionRatio"])
    );
    const estimatedCommissionCents =
      parseMoneyToCents(
        pickValue(commissionInfo, ["couponCommission", "commission"]) ??
          pickValue(goods, ["yongjin_jine", "commission"])
      ) || estimateCommissionCents(itemPriceCents, commissionRate);

    return {
      platform: "jd",
      itemId: skuId || materialUrl,
      itemTitle:
        pickString(goods, ["skuName", "goodsName", "title", "tao_title", "jianjie"]) ||
        pickString(data, ["skuName", "goodsName"]) ||
        "京东商品",
      itemImageUrl:
        pickJdImage(goods) || pickString(goods, ["pict_url", "pic_url", "imageUrl"]) || pickString(data, ["imageUrl", "imgUrl"]),
      itemPriceCents,
      commissionRate,
      estimatedCommissionCents,
      generatedPassword: "",
      generatedShortUrl: shortUrl,
      generatedClickUrl: clickUrl || shortUrl
    };
  }

  // 折淘客「京东商品详情」接口：用 skuId 查标题/价格/佣金（无需官方京东联盟密钥）
  // 折淘客「京东商品详情(大字段)」接口：content 可传 skuId 或京东 URL/口令，
  // 折淘客自行解析并返回 skuId + 标题 + 图（不含价格/佣金）
  private async fetchJdBigField(content: string): Promise<Record<string, unknown>> {
    if (!content) return {};
    try {
      const url = new URL(this.config.jdBigFieldUrl);
      url.searchParams.set("appkey", this.config.appKey);
      url.searchParams.set("content", content); // URLSearchParams 自动 urlencode
      // 该接口要求有效的 sceneId（京东推广位/场景枚举值，非 unionId）——用配置的推广位 id
      const sceneId = this.config.jdPositionId;
      if (isRealConfigValue(sceneId)) {
        url.searchParams.set("sceneId", sceneId);
        url.searchParams.set("positionId", sceneId);
      }
      const response = await this.fetch(url.toString());
      const text = await response.text();
      // 诊断：打印请求(appkey 打码)与返回，确认 sceneId/content 是否带上
      console.log(
        `[ztk-jd-bigfield] req=${url.toString().replace(this.config.appKey, "***")} resp=${text.slice(0, 600)}`
      );
      if (!response.ok) return {};
      const payload = JSON.parse(text) as unknown;
      const arr = Array.isArray(payload)
        ? payload
        : pickValue(asRecord(payload) ?? {}, ["content", ""]) ?? payload;
      const first = Array.isArray(arr) ? arr[0] : arr;
      return asRecord(first) ?? {};
    } catch (error) {
      console.warn("[ztk-jd-bigfield] 查询失败:", (error as Error).message);
      return {};
    }
  }

  private async fetchJdItemInfo(skuId: string): Promise<Record<string, unknown>> {
    try {
      const url = new URL(this.config.jdItemInfoUrl);
      url.searchParams.set("appkey", this.config.appKey);
      if (isRealConfigValue(this.config.sid)) url.searchParams.set("sid", this.config.sid);
      url.searchParams.set("num_iids", skuId); // 商品ID（折淘客多用 num_iids）
      url.searchParams.set("id", skuId); // 兜底别名
      const response = await this.fetch(url.toString());
      const text = await response.text();
      // 诊断日志：字段命名未知，先打出来便于校准（docker logs 查 ztk-jd-detail）
      console.log(`[ztk-jd-detail] resp=${text.slice(0, 1000)}`);
      if (!response.ok) return {};
      const payload = JSON.parse(text) as Record<string, unknown>;
      // 兼容 {content:[{...}]} / {content:{...}} / 直接数组 / {"":[{...}]}
      const content = pickValue(payload, ["content", ""]) ?? payload;
      const first = Array.isArray(content) ? content[0] : content;
      return asRecord(first) ?? {};
    } catch (error) {
      console.warn("[ztk-jd-detail] 查询失败:", (error as Error).message);
      return {};
    }
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
        jdPositionId: config.zhetaokeJdPositionId ?? "",
        jdItemInfoUrl: config.zhetaokeJdItemInfoUrl ?? "https://j.zhetaoke.com/user/open/open_item_info3.aspx",
        jdBigFieldUrl:
          config.zhetaokeJdBigFieldUrl ??
          "http://api.zhetaoke.com:20000/api/open_jd_union_open_goods_bigfield_query.ashx"
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
  if (lower.includes("jd.com") || lower.includes("3.cn") || lower.includes("u.jd.com")) return "jd";
  // 京东 App 分享口令：`数字:/！token！` 或 `！token！`（淘宝口令用 ￥ 分隔，不会撞）
  if (/:\/{1,2}[!！]/.test(rawContent) || /[!！][0-9a-zA-Z]{6,}[!！]/.test(rawContent)) return "jd";
  if (lower.includes("yangkeduo.com") || lower.includes("pinduoduo.com") || lower.includes("pdd")) return "pdd";
  if (lower.includes("vip.com") || lower.includes("vipshop.com")) return "vip";
  return "taobao";
}

function extractJdSkuId(rawContent: string): string {
  return (
    rawContent.match(/item(?:\.m)?\.jd\.com\/(?:product\/)?(\d{6,})\.html/i)?.[1] ??
    rawContent.match(/[?&](?:sku|skuid|wareid)=(\d{6,})/i)?.[1] ??
    rawContent.match(/\/(\d{8,})\.html/)?.[1] ??
    ""
  );
}

function extractJdMaterialId(rawContent: string): string {
  const url = rawContent.match(/https?:\/\/(?:u\.jd\.com|3\.cn|item\.jd\.com|item\.m\.jd\.com)\/[^\s，。"'<>]+/i);
  if (url) return url[0];
  // 京东 App 口令：取 `数字:/！token！` 整段，避免把标题等多余文字一起发给折淘客
  const kouling = rawContent.match(/\d*:\/{1,2}[!！][^!！\s]+[!！]/);
  if (kouling) return kouling[0];
  return rawContent.trim();
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

// 取完整商品标题：title 常被折淘客截断，jianjie 多为完整名；当 jianjie 是 title 的
// 扩展（以 title 开头）时用 jianjie，否则用 title，避免误用无关的简介。
function pickFullTitle(content: Record<string, unknown>): string {
  const title = pickString(content, ["title", "tao_title", "goods_name"]).trim();
  const jianjie = pickString(content, ["jianjie", "shortTitle", "sub_title"]).trim();
  if (jianjie && (!title || jianjie.startsWith(title))) return jianjie;
  return title || "淘宝商品";
}

// 解析淘宝数字商品 id（归因要与订单接口的 item_id 完全相等）。
// 顺序：响应里的数字字段 → fallback 本身是数字 → 响应链接/原文里的 id=数字 → 空。
function extractNumericItemId(content: Record<string, unknown>, fallbackId: string): string {
  const direct = pickString(content, ["tao_id", "item_id", "num_iid", "goods_id"]);
  if (/^\d{6,}$/.test(direct)) return direct;
  if (/^\d{6,}$/.test(String(fallbackId))) return String(fallbackId);
  const candidates = [
    pickString(content, ["coupon_click_url", "item_url", "click_url", "url"]),
    pickString(content, ["shorturl", "short_url"]),
    String(fallbackId ?? "")
  ];
  for (const text of candidates) {
    const fromParam = text.match(/[?&](?:id|num_iid|item_id|itemId)=(\d{6,})/);
    if (fromParam) return fromParam[1];
    const fromPath = text.match(/\/(\d{9,})\.htm/);
    if (fromPath) return fromPath[1];
  }
  return "";
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

function ensureHttps(url: string): string {
  if (!url) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}
