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

export type CreateTaobaoClientConfig = {
  dingdanxiaApiKey?: string;
  dingdanxiaApiUrl?: string;
  dingdanxiaPid?: string;
};

type DingdanxiaClientDependencies = {
  fetch?: typeof fetch;
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
  if (isRealConfigValue(config.dingdanxiaApiKey ?? "")) {
    return new DingdanxiaClient({
      apiKey: config.dingdanxiaApiKey!,
      apiUrl: config.dingdanxiaApiUrl ?? "https://api.tbk.dingdanxia.com/tbk/wn_convert",
      pid: config.dingdanxiaPid
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
