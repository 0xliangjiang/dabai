import { createHmac } from "node:crypto";
import type { AppConfig } from "../../config/env.js";
import { fetchWithTimeout } from "../http.js";

export type VirtualPaymentQueryResult = {
  status: number;
  wxOrderId: string | null;
};

export class WechatVirtualPaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WechatVirtualPaymentError";
  }
}

export function virtualPaymentAppKey(config: AppConfig, env: 0 | 1): string {
  return (env === 1 ? config.sportsVirtualPaymentSandboxAppKey : config.sportsVirtualPaymentAppKey)?.trim() || "";
}

export function createVirtualPaymentSignatures(input: {
  appKey: string;
  sessionKey: string;
  signData: string;
}): { paySig: string; signature: string } {
  return {
    paySig: hmac(input.appKey, `requestVirtualPayment&${input.signData}`),
    signature: hmac(input.sessionKey, input.signData)
  };
}

export function createVirtualPaymentApi(fetcher: typeof fetch = fetch) {
  let cachedToken = "";
  let cachedTokenKey = "";
  let tokenExpiresAt = 0;

  async function accessToken(config: AppConfig): Promise<string> {
    const key = `${config.wechatAppId}:${config.wechatAppSecret}`;
    if (cachedToken && cachedTokenKey === key && Date.now() < tokenExpiresAt) return cachedToken;
    const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", config.wechatAppId);
    url.searchParams.set("secret", config.wechatAppSecret);
    const response = await fetchWithTimeout(fetcher, url, {}, 10_000);
    const payload = await response.json() as {
      access_token?: string; expires_in?: number; errcode?: number; errmsg?: string;
    };
    if (!response.ok || !payload.access_token) {
      throw new WechatVirtualPaymentError(
        `获取微信接口凭证失败：${payload.errcode ?? response.status} ${payload.errmsg ?? ""}`.trim()
      );
    }
    cachedToken = payload.access_token;
    cachedTokenKey = key;
    tokenExpiresAt = Date.now() + Math.max(60, (payload.expires_in ?? 7200) - 300) * 1000;
    return cachedToken;
  }

  return {
    async queryOrder(config: AppConfig, input: {
      openid: string;
      outTradeNo: string;
      env: 0 | 1;
    }): Promise<VirtualPaymentQueryResult> {
      const token = await accessToken(config);
      const body = JSON.stringify({ openid: input.openid, env: input.env, order_id: input.outTradeNo });
      const appKey = virtualPaymentAppKey(config, input.env);
      const paySig = hmac(appKey, `/xpay/query_order&${body}`);
      const url = new URL("https://api.weixin.qq.com/xpay/query_order");
      url.searchParams.set("access_token", token);
      url.searchParams.set("pay_sig", paySig);
      const response = await fetchWithTimeout(fetcher, url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body
      }, 10_000);
      const payload = await response.json() as {
        errcode?: number; errmsg?: string;
        order?: { status?: number; wx_order_id?: string };
      };
      if (!response.ok || payload.errcode !== 0 || !Number.isInteger(payload.order?.status)) {
        throw new WechatVirtualPaymentError(
          `查询虚拟支付订单失败：${payload.errcode ?? response.status} ${payload.errmsg ?? ""}`.trim()
        );
      }
      return { status: payload.order!.status!, wxOrderId: payload.order?.wx_order_id || null };
    },

    async notifyProvided(config: AppConfig, input: {
      outTradeNo: string;
      wxOrderId?: string | null;
      env: 0 | 1;
    }): Promise<void> {
      const token = await accessToken(config);
      const url = new URL("https://api.weixin.qq.com/xpay/notify_provide_goods");
      url.searchParams.set("access_token", token);
      const body = input.wxOrderId
        ? { order_id: input.outTradeNo, wx_order_id: input.wxOrderId, env: input.env }
        : { order_id: input.outTradeNo, env: input.env };
      const response = await fetchWithTimeout(fetcher, url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }, 10_000);
      if (!response.ok) {
        throw new WechatVirtualPaymentError(`通知虚拟商品发货失败：HTTP ${response.status}`);
      }
    }
  };
}

function hmac(key: string, content: string): string {
  return createHmac("sha256", key).update(content).digest("hex");
}
