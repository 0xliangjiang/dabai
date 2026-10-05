import { afterEach, describe, expect, test } from "vitest";
import { createHash } from "node:crypto";
import { createApp } from "../src/app.js";
import { signUserToken } from "../src/auth/token.js";
import { verifySportsToken } from "../src/auth/sports-token.js";
import { loadConfig } from "../src/config/env.js";
import { encryptCredential } from "../src/integrations/zepp/credentials.js";
import { createRepositories } from "../src/repositories/memory.js";

const apps: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(a => a.close())); });
const cfg = { ...loadConfig({ NODE_ENV: "test" }), wechatAppId: "wx1111111111111111", wechatAppSecret: "source-secret", sportsAppId: "wx2222222222222222", sportsAppSecret: "sports-secret", sportsAppRewardedVideoAdUnitId: "adunit-sports", sportsRewardedVideoAdUnitId: "", zeppCredentialKey: "bridge-test-credential-key-123456", nanrunApiKey: "test-key" };
async function setup(legacyEnabled = true) {
  let stepCalls = 0;
  const repositories = createRepositories();
  const user = await repositories.users.findOrCreateByOpenid("source-openid", { unionid: "same-union" });
  await repositories.sportsAccounts.create({ userId: user.id, email: "sports@example.com", passwordCipher: encryptCredential("never-expose-this", cfg.zeppCredentialKey), captchaKey: "captcha", captchaExpiresAt: new Date(), membershipExpiresAt: null });
  await repositories.sportsAccounts.update(user.id, { bindStatus: "bound", status: "ready", zeppUserId: "zepp-id" });
  await repositories.settings.setSportsEnabled(true);
  const app = await createApp({ config: { ...cfg, sportsLegacyActionsEnabled: legacyEnabled }, repositories,
    zeppClient: {
      getRegistrationCaptcha: async () => { throw new Error("unused"); }, recognizeCaptcha: async () => "unused",
      registerAccount: async () => {}, login: async () => { throw new Error("unused"); }, getBindTicket: async () => "unused",
      checkBindStatus: async () => true, updateSteps: async input => { stepCalls += 1; return { steps: input.steps, date: "2026-10-02" }; }
    }, wechatAuthFetch: async input => {
    const url = new URL(String(input));
    expect(url.searchParams.get("appid")).toBe(cfg.sportsAppId);
    expect(url.searchParams.get("secret")).toBe(cfg.sportsAppSecret);
    const code = url.searchParams.get("js_code");
    return Response.json({ openid: code === "other" ? "other-sports-openid" : "sports-openid", unionid: code === "mismatch" ? "different-union" : "same-union" });
  } });
  apps.push(app);
  const headers = { authorization: `Bearer ${signUserToken(user.id, cfg.authTokenSecret)}` };
  const handoff = async () => {
    const res = await app.inject({ method: "POST", url: "/api/sports-app/handoff", headers });
    expect(res.statusCode).toBe(200); return res.json().ticket as string;
  };
  const login = (ticket?: string, code = "valid") => app.inject({ method: "POST", url: "/api/sports-app/login", payload: { code, ...(ticket ? { ticket } : {}) } });
  return { app, repositories, user, headers, handoff, login, stepCalls: () => stepCalls };
}

describe("independent sports app", () => {
  test("links the existing account with a one-time ticket and supports later standalone login", async () => {
    const { app, handoff, login, user, headers } = await setup();
    const ticket = await handoff();
    const res = await login(ticket);
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json())).toEqual(["token"]);
    const token = res.json().token;
    expect(verifySportsToken(token, cfg.authTokenSecret)).toEqual({ userId: user.id, appId: cfg.sportsAppId });
    const account = await app.inject({ url: "/api/sports/account", headers: { authorization: `Bearer ${token}` } });
    expect(account.statusCode).toBe(200);
    expect(account.json()).toMatchObject({ isBound: true });
    expect(account.body).not.toContain("never-expose-this");
    expect((await login(ticket)).statusCode).toBe(410);
    expect((await login()).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/sports/account", headers })).statusCode).toBe(200);
  });
  test("blocks orders, withdrawal, account binding, virtual payment and further handoffs for sports sessions", async () => {
    const { app, handoff, login } = await setup();
    const token = (await login(await handoff())).json().token;
    for (const [method, url] of [["GET", "/api/orders/me"], ["POST", "/api/withdrawals"], ["POST", "/api/sports/bind/start"], ["POST", "/api/sports/unbind"], ["POST", "/api/sports/virtual-payment/create"], ["POST", "/api/sports-app/handoff"]] as const) {
      expect((await app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: method === "POST" ? {} : undefined })).statusCode).toBe(403);
    }
    const chat = await app.inject({ method: "POST", url: "/api/sports/chat", headers: { authorization: `Bearer ${token}` }, payload: { message: "解绑账号", history: [] } });
    expect(chat.json()).toMatchObject({ action: "manage_account" });
    expect((await app.inject({ url: "/api/sports/account", headers: { authorization: `Bearer ${token}` } })).json().isBound).toBe(true);
  });
  test("only one concurrent exchange can consume a ticket", async () => {
    const { handoff, login } = await setup();
    const ticket = await handoff();
    const results = await Promise.all(Array.from({ length: 6 }, () => login(ticket)));
    expect(results.filter(r => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter(r => r.statusCode === 410)).toHaveLength(5);
  });
  test("rejects expired tickets, mismatched UnionID and conflicting linked identities", async () => {
    const { handoff, login, repositories, user } = await setup();
    const ticket = await handoff();
    expect((await login(ticket, "mismatch")).statusCode).toBe(409);
    expect((await login(ticket)).statusCode).toBe(200);
    expect((await login(await handoff(), "other")).statusCode).toBe(409);
    const expired = "a".repeat(64);
    await repositories.sportsBridge.createHandoff({ tokenHash: createHash("sha256").update(expired).digest("hex"), userId: user.id, appId: cfg.sportsAppId, expiresAt: new Date(0) }, new Date());
    expect((await login(expired)).statusCode).toBe(410);
  });
  test("requires linking first and uses the second app's own advertisement configuration", async () => {
    const { app, handoff, login } = await setup();
    expect((await login()).json().code).toBe("LINK_REQUIRED");
    const token = (await login(await handoff())).json().token;
    const reward = await app.inject({ method: "POST", url: "/api/sports/ad/reward", headers: { authorization: `Bearer ${token}` } });
    expect(reward.statusCode).toBe(200);
    expect(reward.json().grantToken).toBeTruthy();
    expect((await app.inject({ url: "/api/sports-app/config" })).json().rewardedVideoAdUnitId).toBe("adunit-sports");
  });
  test("shares step results with the original app and consumes an ad grant only once", async () => {
    const { app, handoff, login, headers, stepCalls } = await setup();
    const sportsHeaders = { authorization: `Bearer ${(await login(await handoff())).json().token}` };
    const reward = await app.inject({ method: "POST", url: "/api/sports/ad/reward", headers: sportsHeaders });
    const payload = { message: "今天运动目标 20000 步", accessGrantToken: reward.json().grantToken };
    const first = await app.inject({ method: "POST", url: "/api/sports/chat", headers: sportsHeaders, payload });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ success: true, steps: 20000 });
    const original = await app.inject({ url: "/api/sports/account", headers });
    expect(original.json().todayTargetSteps).toBe(20000);
    const repeated = await app.inject({ method: "POST", url: "/api/sports/chat", headers: sportsHeaders, payload });
    expect(repeated.json().action).toBe("ad_grant_invalid");
    expect(stepCalls()).toBe(1);
  });
  test("the migration switch blocks only original step/ad operations and preserves account linking", async () => {
    const { app, handoff, login, headers } = await setup(false);
    const sportsHeaders = { authorization: `Bearer ${(await login(await handoff())).json().token}` };
    expect((await app.inject({ url: "/api/app-config" })).json().sportsLegacyActionsEnabled).toBe(false);
    expect((await app.inject({ url: "/api/sports/account", headers })).statusCode).toBe(200);
    for (const url of ["/api/sports/chat", "/api/sports/ad/reward"]) {
      expect((await app.inject({ method: "POST", url, headers, payload: { message: "今天运动目标 10000 步" } })).statusCode).toBe(410);
    }
    expect((await app.inject({ method: "POST", url: "/api/sports/ad/reward", headers: sportsHeaders })).statusCode).toBe(200);
    expect(await handoff()).toHaveLength(64);
  });

  test("keeps migration disabled unless a distinct second app is configured", async () => {
    for (const sportsAppId of ["", cfg.wechatAppId]) {
      const app = await createApp({ config: { ...cfg, sportsAppId, sportsLegacyActionsEnabled: false }, repositories: createRepositories() }); apps.push(app);
      expect((await app.inject({ url: "/api/app-config" })).json()).toMatchObject({ sportsApp: null, sportsLegacyActionsEnabled: true });
      expect((await app.inject({ method: "POST", url: "/api/sports-app/login", payload: { code: "valid" } })).statusCode).toBe(503);
    }
  });
  test("rejects banned users and modified sports tokens", async () => {
    const { app, handoff, login, repositories, user } = await setup();
    const token = (await login(await handoff())).json().token;
    const headers = { authorization: `Bearer ${token.slice(0, -1)}!` };
    expect((await app.inject({ url: "/api/sports/account", headers })).statusCode).toBe(401);
    await repositories.users.updateStatus(user.id, "banned");
    expect((await app.inject({ url: "/api/sports/account", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(403);
    expect((await login()).statusCode).toBe(403);
  });
});
