import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";
import { createRepositories } from "../src/repositories/memory.js";
import { encryptCredential } from "../src/integrations/zepp/credentials.js";
import { signUserToken } from "../src/auth/token.js";

const apps: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
const cfg = { ...loadConfig({ NODE_ENV: "test" }), zeppCredentialKey: "unbind-test-credential-key-123456", zeppCaptchaRetryTimes: 1 };
const expiry = new Date("9999-12-31T23:59:59.999Z");

async function setup() {
  let registrations = 0;
  const repositories = createRepositories();
  const user = await repositories.users.findOrCreateByOpenid("self-unbind-user");
  await repositories.sportsAccounts.create({ userId: user.id, email: "original@gmail.com", passwordCipher: encryptCredential("old-password", cfg.zeppCredentialKey), captchaKey: "old-captcha", captchaExpiresAt: new Date(), membershipExpiresAt: expiry });
  await repositories.sportsAccounts.update(user.id, { status: "ready", bindStatus: "bound", zeppUserId: "old-zepp" });
  const app = await createApp({ config: cfg, repositories, sportsQrEncoder: async ticket => ticket, zeppClient: {
    getRegistrationCaptcha: async () => ({ key: "new-captcha", imageBase64: "image" }), recognizeCaptcha: async () => "1234",
    registerAccount: async () => { registrations++; }, login: async () => ({ userId: `new-zepp-${registrations}`, loginToken: "new-login", appToken: "new-app" }),
    getBindTicket: async id => `ticket-${id}`, checkBindStatus: async () => true, updateSteps: async input => ({ steps: input.steps, date: "2026-10-05" })
  } });
  apps.push(app);
  const headers = { authorization: `Bearer ${signUserToken(user.id, cfg.authTokenSecret)}` };
  const account = async () => (await app.inject({ url: "/api/sports/account", headers })).json();
  const unbind = (accountId: string) => app.inject({ method: "POST", url: "/api/sports/unbind", headers, payload: { accountId } });
  const rebind = async () => {
    expect((await app.inject({ method: "POST", url: "/api/sports/bind/start", headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/sports/bind/refresh", headers })).json().isBound).toBe(true);
  };
  return { app, repositories, user, headers, account, unbind, rebind };
}

describe("self-service sports unbinding", () => {
  test("a chat unbind request only prepares confirmation and shares the button's lifetime quota", async () => {
    const { app, repositories, user, headers, account, unbind, rebind } = await setup();
    const chat = (message: string) => app.inject({ method: "POST", url: "/api/sports/chat", headers, payload: { message, history: [] } });
    const old = (await repositories.sportsAccounts.findByUser(user.id))!;
    const preview = await chat("帮我解绑运动账号");
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ action: "unbind_confirm", accountId: old.id, selfUnbindRemaining: 3 });
    expect(await repositories.sportsAccounts.getSelfUnbindCount(user.id)).toBe(0);
    expect((await repositories.sportsAccounts.findByUser(user.id))!.id).toBe(old.id);
    expect((await chat("不要解绑账号")).json().action).toBe("reply");
    expect((await chat("怎么解绑账号")).json().action).toBe("reply");
    expect((await unbind(preview.json().accountId)).statusCode).toBe(200);
    expect((await chat("解绑账号")).json().action).toBe("unbind_no_account");
    await rebind();
    expect((await chat("解绑账号")).json().selfUnbindRemaining).toBe(2);
    for (let used = 2; used <= 3; used++) {
      expect((await unbind((await account()).accountId)).statusCode).toBe(200);
      await rebind();
    }
    const blocked = await chat("解绑账号");
    expect(blocked.json()).toMatchObject({ action: "unbind_limit", selfUnbindRemaining: 0 });
    expect(blocked.json().reply).toContain("管理员解绑");
    expect((await account()).isBound).toBe(true);
  });
  test("allows three lifetime unbinds, blocks a fourth, and keeps administrator access", async () => {
    const { app, repositories, user, account, unbind, rebind } = await setup();
    expect(await account()).toMatchObject({ selfUnbindLimit: 3, selfUnbindUsed: 0, selfUnbindRemaining: 3 });
    for (let used = 1; used <= 3; used++) {
      const old = (await repositories.sportsAccounts.findByUser(user.id))!;
      const response = await unbind(old.id);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ isBound: false, account: null, selfUnbindUsed: used, selfUnbindRemaining: 3 - used, membershipExpiresAt: expiry.toISOString() });
      const next = (await repositories.sportsAccounts.findByUser(user.id))!;
      expect(next.email).not.toBe(old.email);
      expect(next).toMatchObject({ zeppUserId: null, passwordCipher: "", loginTokenCipher: null, appTokenCipher: null });
      await rebind();
      expect(await account()).toMatchObject({ isBound: true, selfUnbindUsed: used, selfUnbindRemaining: 3 - used });
    }
    const old = (await repositories.sportsAccounts.findByUser(user.id))!;
    const blocked = await unbind(old.id);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: "SPORTS_UNBIND_LIMIT" });
    expect((await repositories.sportsAccounts.findByUser(user.id))!.id).toBe(old.id);
    const admin = await app.inject({ method: "POST", url: `/api/admin/sports/users/${user.id}/unbind`, headers: { "x-admin-token": cfg.adminToken } });
    expect(admin.statusCode).toBe(200);
    expect(await account()).toMatchObject({ isBound: false, selfUnbindUsed: 3, selfUnbindRemaining: 0 });
    await rebind();
    expect((await unbind((await account()).accountId)).json().code).toBe("SPORTS_UNBIND_LIMIT");
  });

  test("concurrent duplicate requests delete once and consume only one opportunity", async () => {
    const { repositories, user, account, unbind } = await setup();
    const id = (await account()).accountId;
    const results = await Promise.all(Array.from({ length: 6 }, () => unbind(id)));
    expect(results.filter(r => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter(r => r.json().code === "SPORTS_UNBIND_CHANGED")).toHaveLength(5);
    expect(await repositories.sportsAccounts.getSelfUnbindCount(user.id)).toBe(1);
    expect((await unbind((await account()).accountId)).json().code).toBe("SPORTS_UNBIND_NO_ACCOUNT");
    expect(await repositories.sportsAccounts.getSelfUnbindCount(user.id)).toBe(1);
  });

  test("rejects other users' account IDs and unauthenticated requests without consuming quota", async () => {
    const { app, repositories, user, account, unbind, headers } = await setup();
    const other = await repositories.users.findOrCreateByOpenid("another-unbind-user");
    const otherAccount = await repositories.sportsAccounts.create({ userId: other.id, email: "another@gmail.com", passwordCipher: "secret", captchaKey: "captcha", captchaExpiresAt: new Date(), membershipExpiresAt: expiry });
    expect((await unbind(otherAccount.id)).json().code).toBe("SPORTS_UNBIND_CHANGED");
    expect((await app.inject({ method: "POST", url: "/api/sports/unbind", payload: { accountId: (await account()).accountId } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/sports/unbind", headers, payload: {} })).statusCode).toBe(400);
    expect(await repositories.sportsAccounts.getSelfUnbindCount(user.id)).toBe(0);
    expect((await repositories.sportsAccounts.findByUser(other.id))!.id).toBe(otherAccount.id);
  });

  test("administrator unbinding does not use a user opportunity and works while registration is disabled", async () => {
    const { app, repositories, user, account, unbind } = await setup();
    await repositories.settings.setSportsEnabled(false);
    expect((await unbind((await account()).accountId)).statusCode).toBe(200);
    expect(await repositories.sportsAccounts.getSelfUnbindCount(user.id)).toBe(1);
    await repositories.sportsAccounts.update(user.id, { bindStatus: "bound", status: "ready", zeppUserId: "replacement-zepp" });
    expect((await app.inject({ method: "POST", url: `/api/admin/sports/users/${user.id}/unbind`, headers: { "x-admin-token": cfg.adminToken } })).statusCode).toBe(200);
    expect(await repositories.sportsAccounts.getSelfUnbindCount(user.id)).toBe(1);
  });
});
