import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { validateProductionConfig, type AppConfig } from "../src/config/env.js";
import type { JdOrderClient } from "../src/integrations/jd/orders.js";
import { MockTaobaoClient } from "../src/integrations/taobao/client.js";

describe("server API", () => {
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
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


  };

  async function buildTestApp() {
    const app = await createApp({
      config: testConfig,
      taobaoClient: new MockTaobaoClient()
    });
    apps.push(app);
    return app;
  }

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  test("GET /health returns ok", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  test("POST /api/auth/wechat-login returns a local session token for a mock code", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "mock-login-code" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      token: expect.stringMatching(/^v1\./),
      user: {
        id: expect.any(String),
        openid: "mock_openid_mock-login-code"
      }
    });
  });

  test("POST /api/auth/wechat-login exchanges real WeChat code when credentials are configured", async () => {
    const app = await createApp({
      config: {
        ...testConfig,
        wechatAppId: "wx-app-id",
        wechatAppSecret: "wx-secret"
      },
      taobaoClient: new MockTaobaoClient(),
      wechatAuthFetch: async (url) => {
        expect(String(url)).toContain("https://api.weixin.qq.com/sns/jscode2session");
        expect(String(url)).toContain("appid=wx-app-id");
        expect(String(url)).toContain("secret=wx-secret");
        expect(String(url)).toContain("js_code=real-login-code");

        return new Response(
          JSON.stringify({
            openid: "real-openid-1",
            unionid: "real-unionid-1"
          }),
          { status: 200 }
        );
      }
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "real-login-code" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      token: expect.stringMatching(/^v1\./),
      user: {
        id: "user-1",
        openid: "real-openid-1",
        unionid: "real-unionid-1"
      }
    });
  });

  test("POST /api/auth/wechat-login returns 401 when WeChat rejects the code", async () => {
    const app = await createApp({
      config: {
        ...testConfig,
        wechatAppId: "wx-app-id",
        wechatAppSecret: "wx-secret"
      },
      taobaoClient: new MockTaobaoClient(),
      wechatAuthFetch: async () =>
        new Response(
          JSON.stringify({
            errcode: 40029,
            errmsg: "invalid code"
          }),
          { status: 200 }
        )
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "bad-login-code" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "微信登录失败，请重试" });
  });

  test("POST /api/conversions validates empty input", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/conversions",
      headers: { authorization: "Bearer local_user-1" },
      payload: { rawContent: "" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "rawContent is required"
    });
  });

  test("POST /api/conversions returns generated password and link for valid input", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/conversions",
      headers: { authorization: "Bearer local_user-1" },
      payload: { rawContent: "￥abc123￥ 淘宝商品" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: expect.any(String),
      itemId: "mock-item-100",
      platform: "taobao",
      generatedPassword: "￥mockpassword￥",
      generatedShortUrl: "https://s.click.taobao.com/mock",
      generatedClickUrl: "https://uland.taobao.com/mock",
      estimatedCommissionCents: 1188,
      estimatedRebateCents: 594
    });
  });

  test("POST /api/conversions/:id/copy records copy intent", async () => {
    const app = await buildTestApp();

    const conversion = await app.inject({
      method: "POST",
      url: "/api/conversions",
      headers: { authorization: "Bearer local_user-1" },
      payload: { rawContent: "https://item.taobao.com/item.htm?id=100" }
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/conversions/${conversion.json().id}/copy`,
      headers: { authorization: "Bearer local_user-1" },
      payload: { copyType: "password" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: expect.any(String),
      conversionId: conversion.json().id,
      copyType: "password"
    });
  });

  test("GET /api/orders/me returns an empty list for a new user", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/orders/me",
      headers: { authorization: "Bearer local_user-1" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ orders: [] });
  });

  test("POST /api/orders/claim saves an order supplement record", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/orders/claim",
      headers: { authorization: "Bearer local_user-1" },
      payload: { orderSuffix: "123456", notes: "用户补充订单尾号" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: expect.any(String),
      userId: "user-1",
      orderSuffix: "123456",
      status: "pending_review"
    });

    const overview = await app.inject({
      method: "GET",
      url: "/api/admin/overview",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(overview.json().metrics.orderClaimCount).toBe(1);
  });

  test("POST /api/jobs/sync-tbk-orders stores and attributes JD orders", async () => {
    const orderClient: JdOrderClient = {
      async fetchJdOrders() {
        return {
          hasNext: false,
          orders: [
            {
              tbkOrderId: "jd-row-1",
              itemId: "mock-item-100",
              itemTitle: "测试京东商品",
              payTime: new Date(),
              payAmountCents: 2390,
              estimatedCommissionCents: 120,
              settledCommissionCents: null,
              orderStatus: "paid",
              rawPayload: { orderId: "jd-row-1" }
            }
          ]
        };
      }
    };
    const app = await createApp({
      config: testConfig,
      taobaoClient: new MockTaobaoClient(),
      orderClient
    });
    apps.push(app);

    const conversion = await app.inject({
      method: "POST",
      url: "/api/conversions",
      headers: { authorization: "Bearer local_user-1" },
      payload: { rawContent: "https://item.taobao.com/item.htm?id=100" }
    });
    await app.inject({
      method: "POST",
      url: `/api/conversions/${conversion.json().id}/copy`,
      headers: { authorization: "Bearer local_user-1" },
      payload: { copyType: "link" }
    });

    const sync = await app.inject({
      method: "POST",
      url: "/api/jobs/sync-tbk-orders",
      headers: { "x-scheduler-token": "dev-scheduler-token" }
    });

    expect(sync.statusCode).toBe(200);
    expect(sync.json()).toMatchObject({ ok: true, jd: { synced: 1, attributed: 1 } });

    const orders = await app.inject({
      method: "GET",
      url: "/api/orders/me",
      headers: { authorization: "Bearer local_user-1" }
    });
    expect(orders.json()).toMatchObject({
      orders: [
        {
          itemTitle: "测试京东商品",
          estimatedCommissionCents: 120,
          userRebateCents: 60
        }
      ]
    });
  });

  test("sync records a run; GET /api/admin/sync-status returns the latest", async () => {
    const orderClient: JdOrderClient = {
      async fetchJdOrders() {
        return {
          hasNext: false,
          orders: [
            {
              tbkOrderId: "jd-sync-status-1",
              itemId: "mock-item-200",
              itemTitle: "状态测试商品",
              payTime: new Date(),
              payAmountCents: 1000,
              estimatedCommissionCents: 50,
              settledCommissionCents: null,
              orderStatus: "paid",
              rawPayload: {}
            }
          ]
        };
      }
    };
    const app = await createApp({ config: testConfig, taobaoClient: new MockTaobaoClient(), orderClient });
    apps.push(app);

    // 同步前：无记录
    const before = await app.inject({
      method: "GET",
      url: "/api/admin/sync-status",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().latest).toBeNull();
    expect(before.json().intervalMinutes).toBeGreaterThan(0);

    await app.inject({
      method: "POST",
      url: "/api/jobs/sync-tbk-orders",
      headers: { "x-admin-token": "dev-admin-token" }
    });

    const after = await app.inject({
      method: "GET",
      url: "/api/admin/sync-status",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(after.statusCode).toBe(200);
    expect(after.json().latest).toMatchObject({
      trigger: "manual",
      ok: true,
      jdSynced: 1,
      errorMessage: null
    });
  });

  test("sync records a failure when a platform throws", async () => {
    const orderClient: JdOrderClient = {
      async fetchJdOrders() {
        return { hasNext: false, orders: [] };
      }
    };
    // 淘宝订单客户端抛错：整体应记为失败，但京东计数仍入账
    const taobaoOrderClient = {
      async fetchTaobaoOrders() {
        throw new Error("折淘客订单接口 401");
      }
    };
    const app = await createApp({
      config: testConfig,
      taobaoClient: new MockTaobaoClient(),
      orderClient,
      taobaoOrderClient
    });
    apps.push(app);

    const sync = await app.inject({
      method: "POST",
      url: "/api/jobs/sync-tbk-orders",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(sync.statusCode).toBe(200);
    expect(sync.json()).toMatchObject({ ok: false });

    const status = await app.inject({
      method: "GET",
      url: "/api/admin/sync-status",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    const latest = status.json().latest;
    expect(latest.ok).toBe(false);
    expect(latest.errorMessage).toContain("淘宝");
    expect(latest.jdSynced).toBe(0);
  });

  test("referral: binds new downline and pays inviter a commission cut", async () => {
    const orderClient: JdOrderClient = {
      async fetchJdOrders() {
        return {
          hasNext: false,
          orders: [
            {
              tbkOrderId: "jd-referral-1",
              itemId: "mock-item-100",
              itemTitle: "下线下单的商品",
              payTime: new Date(),
              payAmountCents: 5000,
              estimatedCommissionCents: 120,
              settledCommissionCents: null,
              orderStatus: "paid",
              rawPayload: {}
            }
          ]
        };
      }
    };
    const app = await createApp({ config: testConfig, taobaoClient: new MockTaobaoClient(), orderClient });
    apps.push(app);

    // 上线 A 登录
    const inviterLogin = await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "mock-inviter" }
    });
    const inviterId = inviterLogin.json().user.id;

    // 新用户 B 带 inviter 注册 → 绑定为 A 的下线
    const downlineLogin = await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "mock-downline", inviterId }
    });
    const downline = downlineLogin.json().user;
    expect(downline.inviterId).toBe(inviterId);

    // 老用户 A 再点别人的邀请链接 → 不改绑
    const reLoginInviter = await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "mock-inviter", inviterId: downline.id }
    });
    expect(reLoginInviter.json().user.inviterId).toBeNull();

    // 开启二级分销，比例 50%
    await app.inject({
      method: "POST",
      url: "/api/admin/config/referral-enabled",
      headers: { "x-admin-token": "dev-admin-token" },
      payload: { enabled: true }
    });
    await app.inject({
      method: "POST",
      url: "/api/admin/config/referral-ratio",
      headers: { "x-admin-token": "dev-admin-token" },
      payload: { referralCommissionRatio: 0.5 }
    });

    // 下线 B 查询并复制（建立归因信号）
    const conversion = await app.inject({
      method: "POST",
      url: "/api/conversions",
      headers: { authorization: `Bearer local_${downline.id}` },
      payload: { rawContent: "https://item.taobao.com/item.htm?id=100" }
    });
    await app.inject({
      method: "POST",
      url: `/api/conversions/${conversion.json().id}/copy`,
      headers: { authorization: `Bearer local_${downline.id}` },
      payload: { copyType: "link" }
    });

    // 同步订单：下线返利 = 120×0.5 = 60(分,pending)；上线提成 = 60×0.5 = 30(分,pending)
    await app.inject({
      method: "POST",
      url: "/api/jobs/sync-tbk-orders",
      headers: { "x-scheduler-token": "dev-scheduler-token" }
    });

    const referral = await app.inject({
      method: "GET",
      url: "/api/users/me/referral",
      headers: { authorization: `Bearer local_${inviterId}` }
    });
    expect(referral.json()).toMatchObject({
      enabled: true,
      downlineCount: 1,
      earnedCents: 0,
      pendingCents: 30
    });

    // 后台用户列表能看到上下级关系
    const adminUsers = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    const downlineRow = adminUsers.json().users.find((u: { id: string }) => u.id === downline.id);
    const inviterRow = adminUsers.json().users.find((u: { id: string }) => u.id === inviterId);
    expect(downlineRow.inviterId).toBe(inviterId);
    expect(inviterRow.downlineCount).toBe(1);

    // 下钻：上级的下线明细，含该下线贡献的提成（30 分）
    const downlineDetail = await app.inject({
      method: "GET",
      url: `/api/admin/users/${inviterId}/downline`,
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(downlineDetail.json().downlines).toHaveLength(1);
    expect(downlineDetail.json().downlines[0]).toMatchObject({
      id: downline.id,
      contributedCents: 30
    });

    // 小程序端：邀请人看自己的下线列表
    const myDownline = await app.inject({
      method: "GET",
      url: "/api/users/me/downline",
      headers: { authorization: `Bearer local_${inviterId}` }
    });
    expect(myDownline.json().downlines).toHaveLength(1);
    expect(myDownline.json().downlines[0]).toMatchObject({ id: downline.id, contributedCents: 30 });
  });

  test("refund reverses a settled order's balance and the inviter's commission", async () => {
    let refunded = false;
    const orderClient: JdOrderClient = {
      async fetchJdOrders() {
        return {
          hasNext: false,
          orders: [
            {
              tbkOrderId: "jd-refund-1",
              itemId: "mock-item-100",
              itemTitle: "结算后退款的商品",
              payTime: new Date(),
              payAmountCents: 5000,
              estimatedCommissionCents: 120,
              settledCommissionCents: 120,
              // 第一次同步：已结算(17)；退款后再同步：失效(2)→冲销
              orderStatus: refunded ? "invalid" : "settled",
              rawPayload: {}
            }
          ]
        };
      }
    };
    const app = await createApp({ config: testConfig, taobaoClient: new MockTaobaoClient(), orderClient });
    apps.push(app);

    const inviterId = (
      await app.inject({ method: "POST", url: "/api/auth/wechat-login", payload: { code: "mock-inv3" } })
    ).json().user.id;
    const downline = (
      await app.inject({
        method: "POST",
        url: "/api/auth/wechat-login",
        payload: { code: "mock-dl3", inviterId }
      })
    ).json().user;
    await app.inject({
      method: "POST",
      url: "/api/admin/config/referral-enabled",
      headers: { "x-admin-token": "dev-admin-token" },
      payload: { enabled: true }
    });
    await app.inject({
      method: "POST",
      url: "/api/admin/config/referral-ratio",
      headers: { "x-admin-token": "dev-admin-token" },
      payload: { referralCommissionRatio: 0.5 }
    });
    const conv = await app.inject({
      method: "POST",
      url: "/api/conversions",
      headers: { authorization: `Bearer local_${downline.id}` },
      payload: { rawContent: "https://item.taobao.com/item.htm?id=100" }
    });
    await app.inject({
      method: "POST",
      url: `/api/conversions/${conv.json().id}/copy`,
      headers: { authorization: `Bearer local_${downline.id}` },
      payload: { copyType: "link" }
    });

    const balanceOf = async (id: string) =>
      (
        await app.inject({
          method: "GET",
          url: "/api/withdrawals/me",
          headers: { authorization: `Bearer local_${id}` }
        })
      ).json().availableBalance;
    const referralEarned = async (id: string) =>
      (
        await app.inject({
          method: "GET",
          url: "/api/users/me/referral",
          headers: { authorization: `Bearer local_${id}` }
        })
      ).json().earnedCents;

    // 第一次同步：结算 → 下线到手 60(分)可用，上线提成 30(分)可用
    await app.inject({
      method: "POST",
      url: "/api/jobs/sync-tbk-orders",
      headers: { "x-scheduler-token": "dev-scheduler-token" }
    });
    expect(await balanceOf(downline.id)).toBe(60);
    expect(await referralEarned(inviterId)).toBe(30);

    // 退款后再同步 → 余额与提成都应被扣回到 0（修复前会残留）
    refunded = true;
    await app.inject({
      method: "POST",
      url: "/api/jobs/sync-tbk-orders",
      headers: { "x-scheduler-token": "dev-scheduler-token" }
    });
    expect(await balanceOf(downline.id)).toBe(0);
    expect(await referralEarned(inviterId)).toBe(0);
  });

  test("referral: no inviter commission when feature disabled", async () => {
    const orderClient: JdOrderClient = {
      async fetchJdOrders() {
        return {
          hasNext: false,
          orders: [
            {
              tbkOrderId: "jd-referral-off-1",
              itemId: "mock-item-100",
              itemTitle: "商品",
              payTime: new Date(),
              payAmountCents: 5000,
              estimatedCommissionCents: 120,
              settledCommissionCents: null,
              orderStatus: "paid",
              rawPayload: {}
            }
          ]
        };
      }
    };
    const app = await createApp({ config: testConfig, taobaoClient: new MockTaobaoClient(), orderClient });
    apps.push(app);

    const inviterId = (
      await app.inject({ method: "POST", url: "/api/auth/wechat-login", payload: { code: "mock-inv2" } })
    ).json().user.id;
    const downline = (
      await app.inject({
        method: "POST",
        url: "/api/auth/wechat-login",
        payload: { code: "mock-dl2", inviterId }
      })
    ).json().user;

    // 开关默认关闭，不设置 → 同步后上线无提成
    const conversion = await app.inject({
      method: "POST",
      url: "/api/conversions",
      headers: { authorization: `Bearer local_${downline.id}` },
      payload: { rawContent: "https://item.taobao.com/item.htm?id=100" }
    });
    await app.inject({
      method: "POST",
      url: `/api/conversions/${conversion.json().id}/copy`,
      headers: { authorization: `Bearer local_${downline.id}` },
      payload: { copyType: "link" }
    });
    await app.inject({
      method: "POST",
      url: "/api/jobs/sync-tbk-orders",
      headers: { "x-scheduler-token": "dev-scheduler-token" }
    });

    const referral = await app.inject({
      method: "GET",
      url: "/api/users/me/referral",
      headers: { authorization: `Bearer local_${inviterId}` }
    });
    expect(referral.json()).toMatchObject({ enabled: false, downlineCount: 1, earnedCents: 0, pendingCents: 0 });
  });

  test("GET /api/admin/conversions lists query history and supports search", async () => {
    const app = await buildTestApp();
    await app.inject({
      method: "POST",
      url: "/api/conversions",
      headers: { authorization: "Bearer local_user-1" },
      payload: { rawContent: "https://item.taobao.com/item.htm?id=100" }
    });

    const all = await app.inject({
      method: "GET",
      url: "/api/admin/conversions",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().conversions.length).toBeGreaterThanOrEqual(1);
    expect(all.json().conversions[0]).toMatchObject({ userId: "user-1" });

    // 搜不到的关键词 → 空
    const none = await app.inject({
      method: "GET",
      url: "/api/admin/conversions?search=zzz-not-exist",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(none.json().conversions).toHaveLength(0);
  });

  test("GET /api/admin/users lists mini program users", async () => {
    const app = await buildTestApp();

    await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "admin-visible-user" }
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { "x-admin-token": "dev-admin-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      users: [
        {
          id: "user-1",
          openid: "mock_openid_admin-visible-user"
        }
      ]
    });
  });

  test("GET /api/admin/config returns operation settings", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/config",
      headers: { "x-admin-token": "dev-admin-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      config: {
        zhetaokePid: "",
        commissionSharingRatio: 0.5,
        attributionWindowHours: 24,
        highValueReviewThresholdCents: 5000,
        exchangeEnabled: false,
        referralCommissionRatio: 0.2,
        referralEnabled: false
      }
    });
  });

  test("GET /api/admin/overview returns dashboard metrics", async () => {
    const app = await buildTestApp();

    await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "overview-user" }
    });
    await app.inject({
      method: "POST",
      url: "/api/conversions",
      headers: { authorization: "Bearer local_user-1" },
      payload: { rawContent: "https://item.taobao.com/item.htm?id=100" }
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/overview",
      headers: { "x-admin-token": "dev-admin-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      metrics: {
        userCount: 1,
        conversionCount: 1,
        copyEventCount: 0,
        pendingAttributionCount: 0,
        orderClaimCount: 0
      }
    });
  });

  test("production config validation fails when critical config is missing", () => {
    expect(() =>
      validateProductionConfig({
        ...testConfig,
        nodeEnv: "production"
      })
    ).toThrow(/DATABASE_URL/);
  });
});
