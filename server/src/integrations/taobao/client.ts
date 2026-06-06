import { createHash } from "node:crypto";

export type TaobaoConversionResult = {
  itemId: string;
  itemTitle: string;
  itemImageUrl: string;
  itemPriceCents: number;
  commissionRate: number;
  generatedPassword: string;
  generatedShortUrl: string;
  generatedClickUrl: string;
};

export interface TaobaoClient {
  convert(rawContent: string): Promise<TaobaoConversionResult>;
}

export type TaobaoClientConfig = {
  appKey: string;
  appSecret: string;
  adzoneId: string;
  apiUrl: string;
};

export type CreateTaobaoClientConfig = {
  provider?: string;
  taobaoAppKey: string;
  taobaoAppSecret: string;
  taobaoApiUrl: string;
  adzoneId: string;
  dingdanxiaApiKey?: string;
  dingdanxiaApiUrl?: string;
  dingdanxiaPid?: string;
};

type TaobaoTopClientDependencies = {
  fetch?: typeof fetch;
  now?: () => Date;
};

type DingdanxiaClientDependencies = {
  fetch?: typeof fetch;
};

type TopTpwdConvertResponse = {
  tbk_tpwd_convert_response?: {
    data?: {
      num_iid?: string;
      click_url?: string;
      model?: string;
      password?: string;
      short_url?: string;
      title?: string;
      item_title?: string;
      pict_url?: string;
      item_image_url?: string;
    };
  };
  error_response?: {
    code?: number;
    msg?: string;
    sub_code?: string;
    sub_msg?: string;
  };
};

export class TaobaoApiError extends Error {
  readonly code?: number;
  readonly subCode?: string;

  constructor(message: string, options: { code?: number; subCode?: string } = {}) {
    super(message);
    this.name = "TaobaoApiError";
    this.code = options.code;
    this.subCode = options.subCode;
  }
}

export class DingdanxiaApiError extends Error {
  readonly code?: number;

  constructor(message: string, options: { code?: number } = {}) {
    super(message);
    this.name = "DingdanxiaApiError";
    this.code = options.code;
  }
}

export function signTopRequest(params: Record<string, string>, appSecret: string): string {
  const sortedKeys = Object.keys(params)
    .filter((key) => key !== "sign" && params[key] !== "")
    .sort();
  const payload = sortedKeys.reduce((buffer, key) => `${buffer}${key}${params[key]}`, "");

  return createHash("md5")
    .update(`${appSecret}${payload}${appSecret}`, "utf8")
    .digest("hex")
    .toUpperCase();
}

export class TaobaoTopClient implements TaobaoClient {
  private readonly fetch: typeof fetch;
  private readonly now: () => Date;

  constructor(
    private readonly config: TaobaoClientConfig,
    dependencies: TaobaoTopClientDependencies = {}
  ) {
    this.fetch = dependencies.fetch ?? fetch;
    this.now = dependencies.now ?? (() => new Date());
  }

  async convert(rawContent: string): Promise<TaobaoConversionResult> {
    const params = this.buildConvertParams(rawContent);
    const body = new URLSearchParams({
      ...params,
      sign: signTopRequest(params, this.config.appSecret)
    });

    const response = await this.fetch(this.config.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=utf-8"
      },
      body
    });

    if (!response.ok) {
      throw new TaobaoApiError(`Taobao TOP HTTP ${response.status}`);
    }

    const payload = (await response.json()) as TopTpwdConvertResponse;
    if (payload.error_response) {
      throw new TaobaoApiError(
        payload.error_response.sub_msg ?? payload.error_response.msg ?? "Taobao TOP API error",
        {
          code: payload.error_response.code,
          subCode: payload.error_response.sub_code
        }
      );
    }

    const data = payload.tbk_tpwd_convert_response?.data;
    if (!data) {
      throw new TaobaoApiError("Taobao TOP response missing conversion data");
    }

    return {
      itemId: data.num_iid ?? "",
      itemTitle: data.title ?? data.item_title ?? `Taobao item ${data.num_iid ?? "unknown"}`,
      itemImageUrl: data.pict_url ?? data.item_image_url ?? "",
      itemPriceCents: 0,
      commissionRate: 0,
      generatedPassword: data.password ?? data.model ?? "",
      generatedShortUrl: data.short_url ?? "",
      generatedClickUrl: data.click_url ?? ""
    };
  }

  private buildConvertParams(rawContent: string): Record<string, string> {
    return {
      method: "taobao.tbk.tpwd.convert",
      app_key: this.config.appKey,
      sign_method: "md5",
      timestamp: formatTopTimestamp(this.now()),
      format: "json",
      v: "2.0",
      partner_id: "taobaoke-wx",
      password_content: rawContent,
      adzone_id: this.config.adzoneId,
      dx: "1"
    };
  }
}

export type DingdanxiaClientConfig = {
  apiKey: string;
  apiUrl: string;
  pid?: string;
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

export class DingdanxiaClient implements TaobaoClient {
  private readonly fetch: typeof fetch;

  constructor(
    private readonly config: DingdanxiaClientConfig,
    dependencies: DingdanxiaClientDependencies = {}
  ) {
    this.fetch = dependencies.fetch ?? fetch;
  }

  async convert(rawContent: string): Promise<TaobaoConversionResult> {
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
      itemId: String(data.item_id ?? ""),
      itemTitle: itemInfo.title ?? `Taobao item ${data.item_id ?? "unknown"}`,
      itemImageUrl: itemInfo.pict_url ?? "",
      itemPriceCents: finalPrice,
      commissionRate,
      generatedPassword: data.long_coupon_tpwd ?? data.long_item_tpwd ?? data.coupon_tpwd ?? data.item_tpwd ?? "",
      generatedShortUrl: "",
      generatedClickUrl: data.coupon_click_url ?? data.item_url ?? ""
    };
  }
}

export function createTaobaoClient(config: CreateTaobaoClientConfig): TaobaoClient {
  if (config.provider === "dingdanxia" && isRealConfigValue(config.dingdanxiaApiKey ?? "")) {
    return new DingdanxiaClient({
      apiKey: config.dingdanxiaApiKey!,
      apiUrl: config.dingdanxiaApiUrl ?? "https://api.tbk.dingdanxia.com/tbk/wn_convert",
      pid: config.dingdanxiaPid
    });
  }

  if (
    isRealConfigValue(config.taobaoAppKey) &&
    isRealConfigValue(config.taobaoAppSecret) &&
    isRealConfigValue(config.adzoneId) &&
    config.adzoneId !== "mock-adzone"
  ) {
    return new TaobaoTopClient({
      appKey: config.taobaoAppKey,
      appSecret: config.taobaoAppSecret,
      adzoneId: config.adzoneId,
      apiUrl: config.taobaoApiUrl
    });
  }

  return new MockTaobaoClient();
}

export class MockTaobaoClient implements TaobaoClient {
  async convert(_rawContent: string): Promise<TaobaoConversionResult> {
    return {
      itemId: "mock-item-100",
      itemTitle: "Mock Taobao Item",
      itemImageUrl: "https://img.alicdn.com/mock-item.png",
      itemPriceCents: 9900,
      commissionRate: 0.12,
      generatedPassword: "￥mockpassword￥",
      generatedShortUrl: "https://s.click.taobao.com/mock",
      generatedClickUrl: "https://uland.taobao.com/mock"
    };
  }
}

function formatTopTimestamp(date: Date): string {
  const gmt8 = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = gmt8.getUTCFullYear();
  const month = pad(gmt8.getUTCMonth() + 1);
  const day = pad(gmt8.getUTCDate());
  const hour = pad(gmt8.getUTCHours());
  const minute = pad(gmt8.getUTCMinutes());
  const second = pad(gmt8.getUTCSeconds());

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function isRealConfigValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && !trimmed.startsWith("replace-with-");
}

function parseMoneyToCents(value: string | number | undefined): number {
  if (value === undefined || value === "") {
    return 0;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount * 100);
}

function parsePercentRate(value: string | number | undefined): number {
  if (value === undefined || value === "") {
    return 0;
  }

  const percent = Number(value);
  if (!Number.isFinite(percent)) {
    return 0;
  }

  return percent / 100;
}
