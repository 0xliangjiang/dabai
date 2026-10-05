import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import type { Repositories } from "../repositories/types.js";
import { signSportsToken } from "../auth/sports-token.js";
import { resolveWechatSession } from "./auth.js";

export function sportsAppConfigured(config: AppConfig): boolean {
  return /^wx[a-f0-9]{16}$/.test(config.sportsAppId ?? "") &&
    config.sportsAppId !== config.wechatAppId && Boolean(config.sportsAppSecret?.trim());
}
export function legacySportsActionsEnabled(config: AppConfig): boolean {
  return config.sportsLegacyActionsEnabled !== false || !sportsAppConfigured(config);
}
const loginSchema = z.object({ code: z.string().trim().min(1).max(256), ticket: z.string().regex(/^[a-f0-9]{64}$/).optional() });
const hash = (ticket: string) => createHash("sha256").update(ticket).digest("hex");

export async function registerSportsAppRoutes(app: FastifyInstance, repositories: Repositories, config: AppConfig, wechatFetch: typeof fetch = fetch) {
  app.get("/api/sports-app/config", async () => ({
    enabled: sportsAppConfigured(config),
    sourceAppId: config.wechatAppId,
    sportsEnabled: await repositories.settings.getSportsEnabled(),
    rewardedVideoAdUnitId: config.sportsAppRewardedVideoAdUnitId?.trim() || ""
  }));
  app.post("/api/sports-app/handoff", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!sportsAppConfigured(config)) return reply.code(503).send({ error: "第二个小程序尚未配置" });
    const account = await repositories.sportsAccounts.findByUser(request.userId);
    if (!account || account.bindStatus !== "bound") return reply.code(409).send({ error: "请先完成运动账号绑定" });
    const ticket = randomBytes(32).toString("hex");
    const now = new Date(); const expiresAt = new Date(now.getTime() + 120_000);
    await repositories.sportsBridge.createHandoff({ tokenHash: hash(ticket), userId: request.userId, appId: config.sportsAppId!, expiresAt }, now);
    return { ticket, appId: config.sportsAppId, expiresAt: expiresAt.toISOString() };
  });
  app.post("/api/sports-app/login", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!sportsAppConfigured(config)) return reply.code(503).send({ error: "第二个小程序尚未配置" });
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "登录参数不正确" });
    let session;
    try {
      session = await resolveWechatSession(parsed.data.code, { ...config, wechatAppId: config.sportsAppId!, wechatAppSecret: config.sportsAppSecret! }, wechatFetch);
    } catch {
      return reply.code(502).send({ error: "微信登录暂时失败，请重试" });
    }
    let userId: string | undefined;
    if (parsed.data.ticket) {
      const result = await repositories.sportsBridge.link({ tokenHash: hash(parsed.data.ticket), appId: config.sportsAppId!, openid: session.openid, unionid: session.unionid, now: new Date() });
      if (!result.ok) return reply.code(result.reason === "invalid" ? 410 : 409).send({ error: result.reason === "invalid" ? "关联凭证已失效，请返回原小程序重新进入" : "微信账号关联不一致，请使用原来的微信账号" });
      userId = result.userId;
    } else {
      userId = await repositories.sportsBridge.findIdentity(config.sportsAppId!, session.openid);
    }
    if (!userId) return reply.code(409).send({ error: "请先从原小程序完成账号关联", code: "LINK_REQUIRED" });
    const user = await repositories.users.findById(userId);
    if (!user || user.status === "banned") return reply.code(403).send({ error: "账号不可用，请联系客服" });
    return { token: signSportsToken(userId, config.sportsAppId!, config.authTokenSecret) };
  });
}
