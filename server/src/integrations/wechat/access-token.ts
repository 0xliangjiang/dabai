import type { AppConfig } from "../../config/env.js";
import { fetchWithTimeout } from "../http.js";

export const WECHAT_INVALID_ACCESS_TOKEN_CODES = new Set([40001, 40014, 42001]);

export class WechatAccessTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WechatAccessTokenError";
  }
}

export function createWechatAccessTokenProvider(fetcher: typeof fetch = fetch) {
  let cachedToken = "";
  let cachedTokenKey = "";
  let tokenExpiresAt = 0;

  const configKey = (config: AppConfig) => `${config.wechatAppId}:${config.wechatAppSecret}`;

  return {
    async get(config: AppConfig, options: { forceRefresh?: boolean } = {}): Promise<string> {
      const key = configKey(config);
      if (!options.forceRefresh && cachedToken && cachedTokenKey === key && Date.now() < tokenExpiresAt) {
        return cachedToken;
      }

      const response = await fetchWithTimeout(fetcher, "https://api.weixin.qq.com/cgi-bin/stable_token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credential",
          appid: config.wechatAppId,
          secret: config.wechatAppSecret,
          force_refresh: options.forceRefresh === true
        })
      }, 10_000);
      const payload = await response.json() as {
        access_token?: string;
        expires_in?: number;
        errcode?: number;
        errmsg?: string;
      };
      if (!response.ok || !payload.access_token) {
        throw new WechatAccessTokenError(
          `获取微信稳定接口凭证失败：${payload.errcode ?? response.status} ${payload.errmsg ?? ""}`.trim()
        );
      }

      cachedToken = payload.access_token;
      cachedTokenKey = key;
      tokenExpiresAt = Date.now() + Math.max(60, (payload.expires_in ?? 7200) - 300) * 1000;
      return cachedToken;
    },

    invalidate(config: AppConfig): void {
      if (cachedTokenKey !== configKey(config)) return;
      cachedToken = "";
      tokenExpiresAt = 0;
    }
  };
}
