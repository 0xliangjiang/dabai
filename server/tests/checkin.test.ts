import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";
import { MockTaobaoClient } from "../src/integrations/taobao/client.js";
import { chinaDateString, computeStreak, randomCheckInPointHundredths } from "../src/routes/checkins.js";

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
  zhetaokeApiUrl: "https://api.zhetaoke.com:10001/api/open_gaoyongzhuanlian_tkl.ashx",
  zhetaokeAppKey: "",
  zhetaokeSid: "",
  zhetaokePid: "",
  zhetaokeRelationId: "",
  zhetaokeJdApiUrl: "https://api.zhetaoke.com:10001/api/open_jing_union_open_promotion_byunionid_get.ashx",
  zhetaokeJdUnionId: "",
  zhetaokeJdPositionId: "",
  jdUnionAppKey: "",
  jdUnionAppSecret: "",
  jdUnionSiteId: "",
  jdUnionPositionId: "",
  jdUnionSceneId: "",
  zhetaokeOrderApiUrl: "https://api.zhetaoke.com:10001/api/open_order.ashx",
  minimaxApiUrl: "https://api.minimax.chat/v1/text/chatcompletion_v2",
  minimaxApiKey: "",
  minimaxModel: "MiniMax-M3",
  orderSyncIntervalMinutes: 15,
  orderSyncLookbackMinutes: 170,
  autoSettleThresholdYuan: 20,
  autoSettleDelayDays: 7
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
    const { token, user } = login.json() as { token: string; user: { id: string } };
    return { app, user, auth: { authorization: `Bearer ${token}` } };
  }

  test("first check-in awards 0.01-0.10 points, second same-day is rejected", async () => {
    const { app, auth } = await buildAppWithUser();

    const before = await app.inject({ method: "GET", url: "/api/checkins/me", headers: auth });
    expect(before.json()).toMatchObject({ todayChecked: false, streak: 0, totalPoints: 0 });

    const first = await app.inject({ method: "POST", url: "/api/checkins", headers: auth });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ todayChecked: true, streak: 1 });
    expect(first.json().pointsAwarded).toBeGreaterThanOrEqual(0.01);
    expect(first.json().pointsAwarded).toBeLessThanOrEqual(0.1);
    expect(first.json().totalPoints).toBe(first.json().pointsAwarded);

    const second = await app.inject({ method: "POST", url: "/api/checkins", headers: auth });
    expect(second.statusCode).toBe(400);

    const after = await app.inject({ method: "GET", url: "/api/checkins/me", headers: auth });
    expect(after.json()).toMatchObject({
      todayChecked: true,
      streak: 0,
      totalPoints: first.json().pointsAwarded
    });
  });

  test("computeStreak counts consecutive days before today", () => {
    expect(computeStreak([], "2026-06-10")).toBe(0);
    expect(computeStreak(["2026-06-09"], "2026-06-10")).toBe(1);
    expect(computeStreak(["2026-06-09", "2026-06-08", "2026-06-06"], "2026-06-10")).toBe(2);
    expect(computeStreak(["2026-06-08"], "2026-06-10")).toBe(0);
  });

  test("fractional check-in points contribute the same yuan value to the redeemable balance", async () => {
    const { app, user, auth } = await buildAppWithUser();
    const checkin = await app.inject({ method: "POST", url: "/api/checkins", headers: auth });
    const awarded = checkin.json().pointsAwarded as number;
    const awardedCents = Math.round(awarded * 100);

    let balance = await app.inject({ method: "GET", url: "/api/withdrawals/me", headers: auth });
    expect(balance.json()).toMatchObject({ availableBalance: awardedCents, availablePoints: awarded });

    const belowMinimum = await app.inject({
      method: "POST",
      url: "/api/withdrawals",
      headers: auth,
      payload: { points: awarded }
    });
    expect(belowMinimum.statusCode).toBe(400);

    await app.inject({
      method: "POST",
      url: `/api/admin/users/${user.id}/adjust-points`,
      headers: { "x-admin-token": "dev-admin-token" },
      payload: { delta: 10, reason: "ratio-test" }
    });

    balance = await app.inject({ method: "GET", url: "/api/withdrawals/me", headers: auth });
    expect(balance.json()).toMatchObject({
      availableBalance: 1000 + awardedCents,
      availablePoints: 10 + awarded
    });

    const missingAccount = await app.inject({
      method: "POST",
      url: "/api/withdrawals",
      headers: auth,
      payload: { points: 10 }
    });
    expect(missingAccount.statusCode).toBe(400);
    expect(missingAccount.json().error).toBe("请选择收款方式");

    const withdrawal = await app.inject({
      method: "POST",
      url: "/api/withdrawals",
      headers: auth,
      payload: { points: 10, payType: "alipay", payAccount: "13800138000" }
    });
    expect(withdrawal.statusCode).toBe(200);
    expect(withdrawal.json().withdrawal).toMatchObject({
      amountCents: 1000,
      payType: "alipay",
      payAccount: "13800138000"
    });
  });

  test("chinaDateString uses UTC+8", () => {
    expect(chinaDateString(new Date("2026-06-10T17:00:00Z"))).toBe("2026-06-11");
    expect(chinaDateString(new Date("2026-06-10T15:59:00Z"))).toBe("2026-06-10");
  });

  test("random reward covers the inclusive 1-10 hundredths range", () => {
    expect(randomCheckInPointHundredths(() => 0)).toBe(1);
    expect(randomCheckInPointHundredths(() => 0.999999)).toBe(10);
  });
});
