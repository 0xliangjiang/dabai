import { createHmac } from "node:crypto";
import type { AppConfig } from "../../config/env.js";
import { fetchWithTimeout } from "../http.js";
import {
  createWechatAccessTokenProvider,
  WECHAT_INVALID_ACCESS_TOKEN_CODES,
  WechatAccessTokenError
} from "./access-token.js";

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
  const accessTokens = createWechatAccessTokenProvider(fetcher);

  async function accessToken(config: AppConfig, forceRefresh = false): Promise<string> {
    try {
      return await accessTokens.get(config, { forceRefresh });
    } catch (error) {
      if (error instanceof WechatAccessTokenError) {
        throw new WechatVirtualPaymentError(error.message);
      }
      throw error;
    }
  }

  return {
    async queryOrder(config: AppConfig, input: {
      openid: string;
      outTradeNo: string;
      env: 0 | 1;
    }): Promise<VirtualPaymentQueryResult> {
      const body = JSON.stringify({ openid: input.openid, env: input.env, order_id: input.outTradeNo });
      const appKey = virtualPaymentAppKey(config, input.env);
      const paySig = hmac(appKey, `/xpay/query_order&${body}`);
      let response!: Response;
      let payload!: { errcode?: number; errmsg?: string; order?: { status?: number; wx_order_id?: string } };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const token = await accessToken(config, attempt === 1);
        const url = new URL("https://api.weixin.qq.com/xpay/query_order");
        url.searchParams.set("access_token", token);
        url.searchParams.set("pay_sig", paySig);
        response = await fetchWithTimeout(fetcher, url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body
        }, 10_000);
        payload = await response.json() as typeof payload;
        if (attempt === 0 && payload.errcode && WECHAT_INVALID_ACCESS_TOKEN_CODES.has(payload.errcode)) {
          accessTokens.invalidate(config);
          continue;
        }
        break;
      }
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
      const body = input.wxOrderId
        ? { order_id: input.outTradeNo, wx_order_id: input.wxOrderId, env: input.env }
        : { order_id: input.outTradeNo, env: input.env };
      const serializedBody = JSON.stringify(body);
      const appKey = virtualPaymentAppKey(config, input.env);
      const paySig = hmac(appKey, `/xpay/notify_provide_goods&${serializedBody}`);
      let response!: Response;
      let payload!: { errcode?: number; errmsg?: string };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const token = await accessToken(config, attempt === 1);
        const url = new URL("https://api.weixin.qq.com/xpay/notify_provide_goods");
        url.searchParams.set("access_token", token);
        url.searchParams.set("pay_sig", paySig);
        response = await fetchWithTimeout(fetcher, url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: serializedBody
        }, 10_000);
        payload = await response.json() as typeof payload;
        if (attempt === 0 && payload.errcode && WECHAT_INVALID_ACCESS_TOKEN_CODES.has(payload.errcode)) {
          accessTokens.invalidate(config);
          continue;
        }
        break;
      }
      if (!response.ok || payload.errcode !== 0) {
        throw new WechatVirtualPaymentError(
          `通知虚拟商品发货失败：${payload.errcode ?? response.status} ${payload.errmsg ?? ""}`.trim()
        );
      }
    }
  };
}

function hmac(key: string, content: string): string {
  return createHmac("sha256", key).update(content).digest("hex");
}
