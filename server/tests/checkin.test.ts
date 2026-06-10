import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";
import { MockTaobaoClient } from "../src/integrations/taobao/client.js";
import { chinaDateString, computeStreak } from "../src/routes/checkins.js";

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
  zhetaokeApiUrl: "https://api.zhetaoke.com:10001/api/open_gaoyongzhuanlian_tkl.ashx",
  zhetaokeAppKey: "",
  zhetaokeSid: "",
  zhetaokePid: "",
  jdUnionAppKey: "",
  jdUnionAppSecret: "",
  jdUnionSiteId: "",
  jdUnionPositionId: "",


};

describe("daily check-in", () => {
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildAppWithUser() {
    const app = await createApp({ config: testConfig, taobaoClient: new MockTaobaoClient() });
    apps.push(app);
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "mock-checkin" }
    });
    const { token } = login.json() as { token: string };
    return { app, auth: { authorization: `Bearer ${token}` } };
  }

  test("first check-in awards base points, second same-day is rejected", async () => {
    const { app, auth } = await buildAppWithUser();

    const before = await app.inject({ method: "GET", url: "/api/checkins/me", headers: auth });
    expect(before.json()).toMatchObject({ todayChecked: false, streak: 0, totalPoints: 0 });

    const first = await app.inject({ method: "POST", url: "/api/checkins", headers: auth });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      todayChecked: true,
      pointsAwarded: 5,
      streak: 1,
      totalPoints: 5
    });

    const second = await app.inject({ method: "POST", url: "/api/checkins", headers: auth });
    expect(second.statusCode).toBe(400);

    const after = await app.inject({ method: "GET", url: "/api/checkins/me", headers: auth });
    expect(after.json()).toMatchObject({ todayChecked: true, streak: 0, totalPoints: 5 });
  });

  test("computeStreak counts consecutive days before today", () => {
    expect(computeStreak([], "2026-06-10")).toBe(0);
    expect(computeStreak(["2026-06-09"], "2026-06-10")).toBe(1);
    expect(computeStreak(["2026-06-09", "2026-06-08", "2026-06-06"], "2026-06-10")).toBe(2);
    expect(computeStreak(["2026-06-08"], "2026-06-10")).toBe(0);
  });

  test("chinaDateString uses UTC+8", () => {
    expect(chinaDateString(new Date("2026-06-10T17:00:00Z"))).toBe("2026-06-11");
    expect(chinaDateString(new Date("2026-06-10T15:59:00Z"))).toBe("2026-06-10");
  });
});
