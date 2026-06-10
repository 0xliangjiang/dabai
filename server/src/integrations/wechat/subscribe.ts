import type { AppConfig } from "../../config/env.js";

export type SubscribeMessageSender = {
  send(input: {
    openid: string;
    templateId: string;
    page: string;
    data: Record<string, { value: string }>;
  }): Promise<{ ok: boolean; errcode?: number; errmsg?: string }>;
};

export function createSubscribeMessageSender(
  config: AppConfig,
  fetcher: typeof fetch = fetch
): SubscribeMessageSender {
  if (!isRealConfigValue(config.wechatAppId) || !isRealConfigValue(config.wechatAppSecret)) {
    // 开发/测试环境：无真实凭证时模拟发送成功
    return {
      async send() {
        return { ok: true };
      }
    };
  }

  let cachedToken = "";
  let tokenExpiresAt = 0;

  async function getAccessToken(): Promise<string> {
    if (cachedToken && Date.now() < tokenExpiresAt) {
      return cachedToken;
    }
    const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", config.wechatAppId);
    url.searchParams.set("secret", config.wechatAppSecret);

    const response = await fetcher(url);
    const payload = (await response.json()) as { access_token?: string; expires_in?: number; errmsg?: string };
    if (!payload.access_token) {
      throw new Error(`get access_token failed: ${payload.errmsg ?? "unknown"}`);
    }
    cachedToken = payload.access_token;
    tokenExpiresAt = Date.now() + ((payload.expires_in ?? 7200) - 300) * 1000;
    return cachedToken;
  }

  return {
    async send({ openid, templateId, page, data }) {
      const token = await getAccessToken();
      const response = await fetcher(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            touser: openid,
            template_id: templateId,
            page,
            data
          })
        }
      );
      const payload = (await response.json()) as { errcode?: number; errmsg?: string };
      return { ok: !payload.errcode, errcode: payload.errcode, errmsg: payload.errmsg };
    }
  };
}

function isRealConfigValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && !trimmed.startsWith("replace-with-");
}
