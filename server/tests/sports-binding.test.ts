import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig, type AppConfig } from "../src/config/env.js";
import type { ZeppClient } from "../src/integrations/zepp/client.js";
import { decryptCredential } from "../src/integrations/zepp/credentials.js";
import { createRepositories } from "../src/repositories/memory.js";
import { sportsTargetDate } from "../src/routes/sports.js";

const credentialKey = "test-zepp-credential-key-1234567890";

const testConfig: AppConfig = {
  nodeEnv: "test",
  port: 3001,
  databaseUrl: "",
  adminToken: "dev-admin-token",
  schedulerToken: "dev-scheduler-token",
  authTokenSecret: "test-auth-token-secret",
  corsOrigins: ["http://localhost:5173"],
  wechatAppId: "",
  wechatAppSecret: "",
  wechatDealTemplateId: "",
  commissionSharingRatio: 0.5,
  referralCommissionRatio: 0.2,
  zhetaokeApiUrl: "https://example.test/taobao",
  zhetaokeAppKey: "",
  zhetaokeSid: "",
  zhetaokePid: "",
  zhetaokeRelationId: "",
  zhetaokeJdApiUrl: "https://example.test/jd",
  zhetaokeJdUnionId: "",
  zhetaokeJdPositionId: "",
  zhetaokeOrderApiUrl: "https://example.test/orders",
  jdUnionAppKey: "",
  jdUnionAppSecret: "",
  jdUnionSiteId: "",
  jdUnionPositionId: "",
  jdUnionSceneId: "",
  minimaxApiUrl: "https://example.test/minimax",
  minimaxApiKey: "",
  minimaxModel: "mock",
  orderSyncIntervalMinutes: 15,
  orderSyncLookbackMinutes: 170,
  autoSettleThresholdYuan: 20,
  autoSettleDelayDays: 7,
  zeppCredentialKey: credentialKey,
  zeppCaptchaRetryTimes: 5,
  sportsTrialDays: 3,
  nanrunApiUrl: "https://api.nan.run/api/xiaomisport",
  nanrunApiKey: "test-nanrun-key"
};

class MockZeppClient implements ZeppClient {
  bound = false;
  registerCalls = 0;
  stepUpdates: number[] = [];

  async getRegistrationCaptcha() {
    return { key: "captcha-key-1", imageBase64: "captcha-base64" };
  }

  async recognizeCaptcha() {
    return "a7b9";
  }

  async registerAccount(input: { captchaCode: string }) {
    expect(input.captchaCode).toBe("a7b9");
    this.registerCalls += 1;
  }

  async login() {
    return { userId: "zepp-user-1", loginToken: "login-token", appToken: "app-token" };
  }

  async getBindTicket(userId: string) {
    expect(userId).toBe("zepp-user-1");
    return "bind-ticket-1";
  }

  async checkBindStatus() {
    return this.bound;
  }

  async updateSteps(input: { email: string; password: string; steps: number }) {
    expect(input.email).toMatch(/@gmail\.com$/);
    expect(input.password).toMatch(/^[a-z]{12}$/);
    this.stepUpdates.push(input.steps);
    return { steps: input.steps, date: "2026-08-22" };
  }
}

class ManualCaptchaZeppClient extends MockZeppClient {
  override async recognizeCaptcha() {
    return "";
  }
}

describe("sports account binding", () => {
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  test("confirms virtual payment against WeChat and grants membership only once", async () => {
    const repositories = createRepositories();
    const user = await repositories.users.findOrCreateByOpenid("openid-paying-user");
    await repositories.sportsAccounts.create({
      userId: user.id,
      email: "paying-user@gmail.com",
      passwordCipher: "encrypted-password",
      captchaKey: "captcha",
      captchaExpiresAt: new Date(Date.now() + 60_000),
      membershipExpiresAt: null
    });
    const apiCalls: string[] = [];
    const wechatApiFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      apiCalls.push(url);
      if (url.includes("/cgi-bin/token")) {
        return new Response(JSON.stringify({ access_token: "access-token", expires_in: 7200 }), {
          status: 200, headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/xpay/query_order")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ openid: user.openid, env: 1 });
        return new Response(JSON.stringify({
          errcode: 0,
          errmsg: "ok",
          order: { status: 2, wx_order_id: "wx-order-1" }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/xpay/notify_provide_goods")) {
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected WeChat API call: ${url}`);
    };
    const app = await createApp({
      config: {
        ...testConfig,
        wechatAppId: "wx-test-app",
        wechatAppSecret: "wechat-secret",
        sportsVirtualPaymentOfferId: "offer-1",
        sportsVirtualPaymentSandboxAppKey: "sandbox-app-key",
        sportsVirtualPaymentEnv: 1,
        sportsVirtualPaymentProducts: [
          { productId: "sports_member_30d", label: "30天会员", durationDays: 30, priceCents: 990 }
        ]
      },
      repositories,
      zeppClient: new MockZeppClient(),
      wechatAuthFetch: async () => new Response(JSON.stringify({
        openid: user.openid,
        session_key: "session-key"
      }), { status: 200, headers: { "content-type": "application/json" } }),
      wechatApiFetch
    });
    apps.push(app);
    const headers = { authorization: `Bearer local_${user.id}` };

    const created = await app.inject({
      method: "POST",
      url: "/api/sports/virtual-payment/create",
      headers,
      payload: { code: "fresh-wx-code", productId: "sports_member_30d" }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().payment).toMatchObject({ mode: "short_series_goods" });
    expect(JSON.parse(created.json().payment.signData)).toMatchObject({
      offerId: "offer-1", productId: "sports_member_30d", goodsPrice: 990, env: 1
    });

    const confirmed = await app.inject({
      method: "POST",
      url: "/api/sports/virtual-payment/confirm",
      headers,
      payload: { outTradeNo: created.json().outTradeNo }
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({ success: true, alreadyDelivered: false, durationDays: 30 });
    const firstExpiry = (await repositories.sportsAccounts.findByUser(user.id))!.membershipExpiresAt!.getTime();

    const repeated = await app.inject({
      method: "POST",
      url: "/api/sports/virtual-payment/confirm",
      headers,
      payload: { outTradeNo: created.json().outTradeNo }
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().alreadyDelivered).toBe(true);
    expect((await repositories.sportsAccounts.findByUser(user.id))!.membershipExpiresAt!.getTime()).toBe(firstExpiry);
    expect(apiCalls.some((url) => url.includes("/xpay/query_order"))).toBe(true);
  });

  test("loads all membership products and treats the lifetime product as permanent", async () => {
    const productsJson = JSON.stringify([
      { productId: "sports_member_week", label: "周卡", durationDays: 7, priceCents: 288 },
      { productId: "sports_member_month", label: "月卡", durationDays: 30, priceCents: 888 },
      { productId: "sports_member_quarter", label: "季卡", durationDays: 90, priceCents: 1888 },
      { productId: "sports_member_year", label: "年卡", durationDays: 365, priceCents: 2888 },
      { productId: "sports_lifetime", label: "永久卡", durationDays: 0, priceCents: 3888, permanent: true }
    ]);
    const parsed = loadConfig({ SPORTS_VIRTUAL_PAYMENT_PRODUCTS_JSON: productsJson });
    expect(parsed.sportsVirtualPaymentProducts).toHaveLength(5);
    expect(parsed.sportsVirtualPaymentProducts?.map((product) => product.priceCents)).toEqual([288, 888, 1888, 2888, 3888]);
    expect(parsed.sportsVirtualPaymentProducts?.at(-1)).toMatchObject({ durationDays: 0, permanent: true });

    const repositories = createRepositories();
    const user = await repositories.users.findOrCreateByOpenid("openid-lifetime-user");
    await repositories.sportsAccounts.create({
      userId: user.id,
      email: "lifetime-user@gmail.com",
      passwordCipher: "encrypted-password",
      captchaKey: "captcha",
      captchaExpiresAt: new Date(Date.now() + 60_000),
      membershipExpiresAt: null
    });
    const order = await repositories.sportsVirtualPaymentOrders.create({
      outTradeNo: "SPLIFETIMEORDER1",
      userId: user.id,
      productId: "sports_lifetime",
      durationDays: 0,
      priceCents: 3888,
      env: 0
    });
    const now = new Date();
    const first = await repositories.sportsVirtualPaymentOrders.deliver(order.outTradeNo, { paidAt: now, deliveredAt: now });
    expect(first?.membershipExpiresAt.getUTCFullYear()).toBe(9999);
    const repeated = await repositories.sportsVirtualPaymentOrders.deliver(order.outTradeNo, { paidAt: now, deliveredAt: now });
    expect(repeated?.alreadyDelivered).toBe(true);
    expect(repeated?.membershipExpiresAt.getTime()).toBe(first?.membershipExpiresAt.getTime());
  });

  test("creates one managed account, returns QR, then confirms binding", async () => {
    const repositories = createRepositories();
    const zeppClient = new MockZeppClient();
    const app = await createApp({
      config: testConfig,
      repositories,
      zeppClient,
      sportsQrEncoder: async (ticket) => `data:image/png;base64,qr-${ticket}`
    });
    apps.push(app);
    const headers = { authorization: "Bearer local_user-sports-1" };

    const start = await app.inject({ method: "POST", url: "/api/sports/bind/start", headers });
    expect(start.statusCode).toBe(200);
    expect(start.json()).toMatchObject({
      action: "scan",
      qrcodeImage: "data:image/png;base64,qr-bind-ticket-1",
      isBound: false
    });

    const pending = await repositories.sportsAccounts.findByUser("user-sports-1");
    expect(pending?.email).toMatch(/^[a-z0-9]{10}@gmail\.com$/);
    expect(pending?.passwordCipher).not.toContain("a7b9");
    expect(decryptCredential(pending!.passwordCipher, credentialKey)).toMatch(/^[a-z]{12}$/);
    expect(decryptCredential(pending!.loginTokenCipher!, credentialKey)).toBe("login-token");
    expect(decryptCredential(pending!.appTokenCipher!, credentialKey)).toBe("app-token");

    const repeat = await app.inject({ method: "POST", url: "/api/sports/bind/start", headers });
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json().action).toBe("scan");
    expect(zeppClient.registerCalls).toBe(1);

    zeppClient.bound = true;
    const refresh = await app.inject({ method: "POST", url: "/api/sports/bind/refresh", headers });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).toMatchObject({ isBound: true, status: "ready", message: "微信绑定成功" });

    const account = await app.inject({ method: "GET", url: "/api/sports/account", headers });
    expect(account.json()).toMatchObject({ isBound: true, account: { platform: "Zepp Life" } });
  });

  test("returns a configuration error before calling Zepp", async () => {
    const app = await createApp({
      config: { ...testConfig, zeppCredentialKey: "" },
      zeppClient: new MockZeppClient()
    });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/sports/bind/start",
      headers: { authorization: "Bearer local_user-sports-2" }
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toContain("ZEPP_CREDENTIAL_KEY");
  });

  test("blocks sports APIs when the global sports switch is disabled", async () => {
    const repositories = createRepositories();
    await repositories.settings.setSportsEnabled(false);
    const app = await createApp({ config: testConfig, repositories, zeppClient: new MockZeppClient() });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/sports/account",
      headers: { authorization: "Bearer local_user-sports-disabled" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "运动功能暂未开放" });
  });

  test("falls back to manual captcha after OCR retries are exhausted", async () => {
    const app = await createApp({
      config: { ...testConfig, zeppCaptchaRetryTimes: 2 },
      zeppClient: new ManualCaptchaZeppClient(),
      sportsQrEncoder: async (ticket) => `data:image/png;base64,qr-${ticket}`
    });
    apps.push(app);
    const headers = { authorization: "Bearer local_user-sports-manual" };

    const start = await app.inject({ method: "POST", url: "/api/sports/bind/start", headers });
    expect(start.json()).toMatchObject({ action: "captcha", isBound: false });

    const complete = await app.inject({
      method: "POST",
      url: "/api/sports/bind/captcha",
      headers,
      payload: { code: "a7b9" }
    });
    expect(complete.json()).toMatchObject({ action: "scan", isBound: false });
  });

  test("recognizes a brush intent and updates steps only for a bound active member", async () => {
    const repositories = createRepositories();
    const zeppClient = new MockZeppClient();
    const app = await createApp({
      config: testConfig,
      repositories,
      zeppClient,
      sportsQrEncoder: async (ticket) => `data:image/png;base64,qr-${ticket}`
    });
    apps.push(app);
    const headers = { authorization: "Bearer local_user-sports-chat" };

    await app.inject({ method: "POST", url: "/api/sports/bind/start", headers });
    zeppClient.bound = true;
    await app.inject({ method: "POST", url: "/api/sports/bind/refresh", headers });

    const response = await app.inject({
      method: "POST",
      url: "/api/sports/chat",
      headers,
      payload: { message: "帮我把步数刷到2万步", history: [] }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, action: "steps_updated", steps: 20_000 });
    expect(response.json().reply).toBe("设置成功，今天的运动目标为 20,000 步。");
    expect(zeppClient.stepUpdates).toEqual([20_000]);

    const account = await app.inject({ method: "GET", url: "/api/sports/account", headers });
    expect(account.json()).toMatchObject({ isBound: true, todayTargetSteps: 20_000 });
    expect(
      await repositories.sportsDailyTargets.findByUserAndDate(
        "user-sports-chat",
        sportsTargetDate()
      )
    ).toMatchObject({ steps: 20_000 });

    await repositories.sportsDailyTargets.upsert(
      "user-sports-chat",
      sportsTargetDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      10_000
    );
    const reloadedAccount = await app.inject({ method: "GET", url: "/api/sports/account", headers });
    expect(reloadedAccount.json()).toMatchObject({ todayTargetSteps: 20_000 });
  });

  test("lets an expired member consume one rewarded-ad grant exactly once", async () => {
    const repositories = createRepositories();
    const zeppClient = new MockZeppClient();
    const app = await createApp({
      config: { ...testConfig, sportsRewardedVideoAdUnitId: "adunit-test-rewarded-video" },
      repositories,
      zeppClient,
      sportsQrEncoder: async (ticket) => `data:image/png;base64,qr-${ticket}`
    });
    apps.push(app);
    const headers = { authorization: "Bearer local_user-sports-ad" };

    await app.inject({ method: "POST", url: "/api/sports/bind/start", headers });
    zeppClient.bound = true;
    await app.inject({ method: "POST", url: "/api/sports/bind/refresh", headers });
    await repositories.sportsAccounts.update("user-sports-ad", {
      membershipExpiresAt: new Date(Date.now() - 60_000)
    });

    const expired = await app.inject({
      method: "POST",
      url: "/api/sports/chat",
      headers,
      payload: { message: "目标设为 18000 步", history: [] }
    });
    expect(expired.json()).toMatchObject({ success: false, action: "membership_expired" });

    const reward = await app.inject({ method: "POST", url: "/api/sports/ad/reward", headers });
    expect(reward.statusCode).toBe(200);
    const grantToken = reward.json().grantToken as string;

    const granted = await app.inject({
      method: "POST",
      url: "/api/sports/chat",
      headers,
      payload: { message: "目标设为 18000 步", history: [], accessGrantToken: grantToken }
    });
    expect(granted.json()).toMatchObject({ success: true, action: "steps_updated", steps: 18_000 });

    const replay = await app.inject({
      method: "POST",
      url: "/api/sports/chat",
      headers,
      payload: { message: "目标设为 20000 步", history: [], accessGrantToken: grantToken }
    });
    expect(replay.json()).toMatchObject({ success: false, action: "ad_grant_invalid" });
    expect(zeppClient.stepUpdates).toEqual([18_000]);
  });

  test("adds three membership days once when a genuinely new user is invited", async () => {
    const repositories = createRepositories();
    const zeppClient = new MockZeppClient();
    const app = await createApp({
      config: { ...testConfig, sportsInviteRewardDays: 3 },
      repositories,
      zeppClient,
      sportsQrEncoder: async (ticket) => `data:image/png;base64,qr-${ticket}`
    });
    apps.push(app);

    const inviterLogin = await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "mock-sports-inviter" }
    });
    const inviter = inviterLogin.json() as { token: string; user: { id: string } };
    await app.inject({
      method: "POST",
      url: "/api/sports/bind/start",
      headers: { authorization: `Bearer ${inviter.token}` }
    });
    const before = await repositories.sportsAccounts.findByUser(inviter.user.id);

    await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "mock-sports-invitee", inviterId: inviter.user.id }
    });
    const afterFirstLogin = await repositories.sportsAccounts.findByUser(inviter.user.id);
    expect(afterFirstLogin!.membershipExpiresAt!.getTime() - before!.membershipExpiresAt!.getTime())
      .toBe(3 * 86_400_000);

    await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "mock-sports-invitee", inviterId: inviter.user.id }
    });
    const afterRepeatLogin = await repositories.sportsAccounts.findByUser(inviter.user.id);
    expect(afterRepeatLogin!.membershipExpiresAt!.getTime()).toBe(afterFirstLogin!.membershipExpiresAt!.getTime());
  });

  test("does not call Zepp for an informational step message", async () => {
    const zeppClient = new MockZeppClient();
    const app = await createApp({ config: testConfig, zeppClient });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/sports/chat",
      headers: { authorization: "Bearer local_user-sports-no-mutation" },
      payload: { message: "今天走了12000步", history: [] }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().action).toBe("reply");
    expect(zeppClient.stepUpdates).toEqual([]);
  });

  test("generates one-time access codes, redeems membership, and lets admin unbind safely", async () => {
    const repositories = createRepositories();
    const zeppClient = new MockZeppClient();
    const app = await createApp({
      config: testConfig,
      repositories,
      zeppClient,
      sportsQrEncoder: async (ticket) => `data:image/png;base64,qr-${ticket}`
    });
    apps.push(app);
    const user = await repositories.users.findOrCreateByOpenid("openid-sports-code");
    const userId = user.id;
    const userHeaders = { authorization: `Bearer local_${userId}` };
    const adminHeaders = { "x-admin-token": "dev-admin-token" };

    await app.inject({ method: "POST", url: "/api/sports/bind/start", headers: userHeaders });
    zeppClient.bound = true;
    await app.inject({ method: "POST", url: "/api/sports/bind/refresh", headers: userHeaders });
    const before = await repositories.sportsAccounts.findByUser(userId);

    const generated = await app.inject({
      method: "POST",
      url: "/api/admin/sports/access-codes/generate",
      headers: adminHeaders,
      payload: { count: 2, durationDays: 30, validUntil: null }
    });
    expect(generated.statusCode).toBe(200);
    const rawCode = generated.json().codes[0].code as string;
    expect(rawCode).toMatch(/^STEP-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/);

    const redeemed = await app.inject({
      method: "POST",
      url: "/api/sports/chat",
      headers: userHeaders,
      payload: { message: rawCode, history: [] }
    });
    expect(redeemed.json()).toMatchObject({ success: true, action: "access_code_redeemed" });
    const after = await repositories.sportsAccounts.findByUser(userId);
    expect(after!.membershipExpiresAt!.getTime() - before!.membershipExpiresAt!.getTime()).toBe(30 * 86_400_000);

    const reused = await app.inject({
      method: "POST",
      url: "/api/sports/chat",
      headers: userHeaders,
      payload: { message: rawCode, history: [] }
    });
    expect(reused.json()).toMatchObject({ success: false, action: "access_code_invalid" });

    const listedCodes = await app.inject({ method: "GET", url: "/api/admin/sports/access-codes", headers: adminHeaders });
    expect(listedCodes.json().items[0]).not.toHaveProperty("codeHash");
    expect(listedCodes.json().items.some((item: { code: string | null }) => item.code === rawCode)).toBe(true);
    expect(listedCodes.json().items.some((item: { effectiveStatus: string }) => item.effectiveStatus === "redeemed")).toBe(true);

    const users = await app.inject({ method: "GET", url: "/api/admin/sports/users?bindStatus=bound", headers: adminHeaders });
    expect(users.json().items).toHaveLength(1);
    expect(users.json().items[0].account.email).toMatch(/@gmail\.com$/);

    const unbound = await app.inject({ method: "POST", url: `/api/admin/sports/users/${userId}/unbind`, headers: adminHeaders });
    expect(unbound.json()).toMatchObject({ ok: true, account: { bindStatus: "unbound" } });
    const preserved = await repositories.sportsAccounts.findByUser(userId);
    expect(preserved?.membershipExpiresAt).toEqual(after?.membershipExpiresAt);
  });
});
