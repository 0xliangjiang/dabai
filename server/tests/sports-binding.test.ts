import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";
import type { ZeppClient } from "../src/integrations/zepp/client.js";
import { decryptCredential } from "../src/integrations/zepp/credentials.js";
import { createRepositories } from "../src/repositories/memory.js";

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
    expect(zeppClient.stepUpdates).toEqual([20_000]);
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
});
