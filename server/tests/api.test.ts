import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { validateProductionConfig, type AppConfig } from "../src/config/env.js";
import type { DingdanxiaOrderClient } from "../src/integrations/dingdanxia/orders.js";
import { MockTaobaoClient } from "../src/integrations/taobao/client.js";

describe("server API", () => {
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
  const testConfig: AppConfig = {
    nodeEnv: "test",
    port: 3001,
    databaseUrl: "",
    adminToken: "dev-admin-token",
    schedulerToken: "dev-scheduler-token",
    wechatAppId: "",
    wechatAppSecret: "",
    commissionSharingRatio: 0.5,
    dingdanxiaApiKey: "",
    dingdanxiaApiUrl: "https://api.tbk.dingdanxia.com/tbk/wn_convert",
    dingdanxiaPid: "",
    dingdanxiaJdApiUrl: "https://api.tbk.dingdanxia.com/jd/promotion_common",
    dingdanxiaJdGoodsApiUrl: "https://api.tbk.dingdanxia.com/jd/query_goods",
    dingdanxiaJdOrderApiUrl: "https://api.tbk.dingdanxia.com/jd/order_details2",
    dingdanxiaJdSiteId: "",
    dingdanxiaJdUnionId: "",
    dingdanxiaJdAuthKey: "",
    dingdanxiaJdSceneId: "",
    dingdanxiaJdPositionId: "",
    dingdanxiaJdPid: "",
    dingdanxiaPddApiUrl: "https://api.tbk.dingdanxia.com/pdd/url_convert",
    dingdanxiaPddPid: "",
    dingdanxiaPddCustomParameters: "{\"uid\":\"default\"}",
    dingdanxiaVipApiUrl: "https://api.tbk.dingdanxia.com/vip/url_privilege",
    dingdanxiaVipChanTag: "",
    dingdanxiaVipStatParam: ""
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
      token: expect.stringContaining("local_"),
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
      token: "local_user-1",
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
    const orderClient: DingdanxiaOrderClient = {
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
    expect(sync.json()).toMatchObject({ ok: true, synced: 1, attributed: 1 });

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
        dingdanxiaPid: "",
        commissionSharingRatio: 0.5,
        attributionWindowHours: 24,
        highValueReviewThresholdCents: 5000
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
