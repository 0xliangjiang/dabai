import type { AppConfig } from "../../config/env.js";
import { fetchWithTimeout } from "../http.js";
import { createWechatAccessTokenProvider } from "./access-token.js";

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

  const accessTokens = createWechatAccessTokenProvider(fetcher);

  return {
    async send({ openid, templateId, page, data }) {
      const token = await accessTokens.get(config);
      const response = await fetchWithTimeout(
        fetcher,
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
