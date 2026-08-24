import type { FastifyInstance } from "fastify";
import { signUserToken } from "../auth/token.js";
import type { AppConfig } from "../config/env.js";
import { fetchWithTimeout } from "../integrations/http.js";
import type { Repositories } from "../repositories/types.js";

type WechatCode2SessionResponse = {
  openid?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

export async function registerAuthRoutes(
  app: FastifyInstance,
  repositories: Repositories,
  config: AppConfig,
  wechatAuthFetch: typeof fetch = fetch
) {
  app.post<{ Body: { code?: string; inviterId?: string } }>("/api/auth/wechat-login", async (request, reply) => {
    const code = request.body.code?.trim();
    if (!code) {
      return reply.code(400).send({ error: "code is required" });
    }
    const inviterId = request.body.inviterId?.trim() || null;

    try {
      const session = await resolveWechatSession(code, config, wechatAuthFetch);
      const user = await repositories.users.findOrCreateByOpenid(session.openid, {
        unionid: session.unionid,
        inviterId
      });
      if (user.inviterId) {
        await repositories.users.applyPendingSportsInviteRewards(
          user.inviterId,
          positiveDays(config.sportsInviteRewardDays, 3),
          new Date()
        );
      }
      return {
        token: signUserToken(user.id, config.authTokenSecret),
        user
      };
    } catch (error) {
      if (error instanceof WechatLoginError) {
        return reply.code(401).send({ error: "微信登录失败，请重试" });
      }
      throw error;
    }
  });
}

function positiveDays(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

class WechatLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WechatLoginError";
  }
}

async function resolveWechatSession(
  code: string,
  config: AppConfig,
  wechatAuthFetch: typeof fetch
): Promise<{ openid: string; unionid?: string | null }> {
  if (shouldUseMockWechatSession(code, config)) {
    return { openid: `mock_openid_${code}`, unionid: null };
  }

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", config.wechatAppId);
  url.searchParams.set("secret", config.wechatAppSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  const response = await fetchWithTimeout(wechatAuthFetch, url, {}, 10000);
  if (!response.ok) {
    throw new WechatLoginError(`WeChat login HTTP ${response.status}`);
  }

  const payload = (await response.json()) as WechatCode2SessionResponse;
  if (payload.errcode || !payload.openid) {
    throw new WechatLoginError(payload.errmsg ?? "WeChat login failed");
  }

  return {
    openid: payload.openid,
    unionid: payload.unionid ?? null
  };
}

function shouldUseMockWechatSession(code: string, config: AppConfig): boolean {
  return (
    config.nodeEnv !== "production" &&
    (code.startsWith("mock-") ||
      !isRealConfigValue(config.wechatAppId) ||
      !isRealConfigValue(config.wechatAppSecret))
  );
}

function isRealConfigValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && !trimmed.startsWith("replace-with-");
}
