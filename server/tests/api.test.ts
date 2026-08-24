import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { validateProductionConfig, type AppConfig } from "../src/config/env.js";
import type { JdOrderClient } from "../src/integrations/jd/orders.js";
import { MockTaobaoClient, type TaobaoClient } from "../src/integrations/taobao/client.js";

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
  minimaxApiUrl: "https://api.minimax.chat/v1/text/chatcompletion_v2",
  minimaxApiKey: "",
  minimaxModel: "MiniMax-M3",
  orderSyncIntervalMinutes: 15,
  orderSyncLookbackMinutes: 170,
  autoSettleThresholdYuan: 20,
  autoSettleDelayDays: 7
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

  test("POST /api/client-events accepts a whitelisted anonymous event", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/client-events",
      payload: {
        name: "conversion_success",
        visitorId: "visitor-test",
        properties: { platform: "taobao" }
      }
    });

    expect(response.statusCode).toBe(202);
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

  test("POST /api/conversions stores canonical product detail title when available", async () => {
    const taobaoClient = {
      async convert() {
        return {
          platform: "taobao" as const,
          itemId: "660000001",
          itemTitle: "短标题",
          itemImageUrl: "",
          itemPriceCents: 5900,
          commissionRate: 0.1,
          estimatedCommissionCents: 590,
          generatedPassword: "￥newpass￥",
          generatedShortUrl: "https://s.click.taobao.com/x",
          generatedClickUrl: "https://uland.taobao.com/x"
        };
      },
      async getProductDetail(itemId: string) {
        expect(itemId).toBe("660000001");
        return {
          platform: "taobao" as const,
          itemId,
          itemTitle: "官方长标题 商品详情标准名称",
          itemImageUrl: "https://img.alicdn.com/detail.jpg",
          itemPriceCents: 5900
        };
      }
    };
    const app = await createApp({ config: testConfig, taobaoClient });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/conversions",
      headers: { authorization: "Bearer local_user-1" },
      payload: { rawContent: "￥abc123￥ 淘宝商品" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      itemId: "660000001",
      itemTitle: "官方长标题 商品详情标准名称",
      itemImageUrl: "https://img.alicdn.com/detail.jpg"
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
    expect(response.json()).toEqual({
      orders: [],
      totals: { settledPoints: 0, pendingPoints: 0 },
      total: 0,
      page: 1,
      pageSize: 20,
      hasMore: false
    });
  });

  test("GET /api/orders/me groups orders into the four user-facing tabs", async () => {
    const app = await buildTestApp();
    const user = await app.deps.repositories.users.findOrCreateByOpenid("order-tab-user");
    const statuses = ["paid", "received", "settled", "refunded", "invalid"];

    for (const [index, orderStatus] of statuses.entries()) {
      const order = await app.deps.repositories.orders.upsert({
        tbkOrderId: `order-tab-${index}`,
        itemId: `order-tab-item-${index}`,
        itemTitle: `订单分类测试商品 ${index + 1}`,
        payTime: new Date(Date.now() - index * 1000),
        payAmountCents: 10_000,
        estimatedCommissionCents: 500,
        settledCommissionCents: orderStatus === "settled" ? 400 : null,
        orderStatus,
        rawPayload: {}
      });
      await app.deps.repositories.orders.upsertAttribution({
        tbkOrderId: order.tbkOrderId,
        status: "manual_matched",
        confidence: 1,
        reason: "order_tab_test",
        userId: user.id,
        conversionId: null,
        copyEventId: null
      });
    }

    const headers = { authorization: `Bearer local_${user.id}` };
    const paid = await app.inject({ method: "GET", url: "/api/orders/me?status=paid", headers });
    const settled = await app.inject({ method: "GET", url: "/api/orders/me?status=settled", headers });
    const refunded = await app.inject({ method: "GET", url: "/api/orders/me?status=refunded", headers });

    expect(paid.json().orders.map((order: { status: string }) => order.status).sort()).toEqual([
      "paid",
      "received"
    ].sort());
    expect(settled.json().orders.map((order: { status: string }) => order.status)).toEqual([
      "settled"
    ]);
    expect(refunded.json().orders.map((order: { status: string }) => order.status).sort()).toEqual([
      "refunded",
      "invalid"
    ].sort());
  });

  test("POST /api/orders/bind requires an exact full order number and credits through the shared ledger path", async () => {
    const app = await buildTestApp();
    const user = await app.deps.repositories.users.findOrCreateByOpenid("bind-user");
    const fullOrderNumber = "123456789012345678";
    await app.deps.repositories.orders.upsert({
      tbkOrderId: fullOrderNumber,
      itemId: "bind-item",
      itemTitle: "完整订单号测试商品",
      payTime: new Date(),
      payAmountCents: 10000,
      estimatedCommissionCents: 1000,
      settledCommissionCents: null,
      orderStatus: "paid",
      rawPayload: {}
    });

    const suffix = await app.inject({
      method: "POST",
      url: "/api/orders/bind",
      headers: { authorization: `Bearer local_${user.id}` },
      payload: { orderNumber: fullOrderNumber.slice(-12) }
    });
    expect(suffix.statusCode).toBe(404);

    const exact = await app.inject({
      method: "POST",
      url: "/api/orders/bind",
      headers: { authorization: `Bearer local_${user.id}` },
      payload: { orderNumber: fullOrderNumber }
    });
    expect(exact.statusCode).toBe(200);

    const summaries = await app.deps.repositories.orders.listByUser(user.id);
    expect(summaries.items[0]).toMatchObject({
      orderNumber: fullOrderNumber,
      rebateStatus: "pending",
      userRebateCents: 500
    });
  });

  test("admin manual attribution immediately reconciles the user's rebate ledger", async () => {
    const app = await buildTestApp();
    const user = await app.deps.repositories.users.findOrCreateByOpenid("manual-user");
    const order = await app.deps.repositories.orders.upsert({
      tbkOrderId: "987654321098765432",
      itemId: "manual-item",
      itemTitle: "人工归因测试商品",
      payTime: new Date(),
      payAmountCents: 10000,
      estimatedCommissionCents: 1000,
      settledCommissionCents: 800,
      orderStatus: "settled",
      rawPayload: {}
    });
    const attribution = await app.deps.repositories.orders.upsertAttribution({
      tbkOrderId: order.tbkOrderId,
      status: "pending_review",
      confidence: 0.4,
      reason: "multiple_candidates",
      userId: null
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/orders/${attribution.id}/attribute`,
      headers: { "x-admin-token": "dev-admin-token" },
      payload: { userId: user.id }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().rebate).toEqual({ credited: true, rebateStatus: "available" });
    expect(await app.deps.repositories.withdrawals.getAvailableBalance(user.id)).toBe(400);
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

  test("avatar upload rejects files whose bytes do not match the declared image type", async () => {
    const app = await buildTestApp();
    const boundary = "----codex-upload-boundary";
    const body = Buffer.from(
      [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="fake.jpg"',
        "Content-Type: image/jpeg",
        "",
        "this is not a jpeg",
        `--${boundary}--`,
        ""
      ].join("\r\n")
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/uploads/avatar",
      headers: {
        authorization: "Bearer local_user-1",
        "content-type": `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("文件内容");
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
    expect(downlineDetail.json()).toMatchObject({ total: 1 });
    expect(downlineDetail.json().downlines).toHaveLength(1);
    expect(downlineDetail.json().downlines[0]).toMatchObject({
      id: downline.id,
      contributedCents: 30
    });

    // 小程序端：邀请人看自己的下线列表
    const myDownline = await app.inject({
      method: "GET",
      url: "/api/users/me/downline?page=1&pageSize=1",
      headers: { authorization: `Bearer local_${inviterId}` }
    });
    expect(myDownline.json()).toMatchObject({ total: 1, page: 1, pageSize: 1, hasMore: false });
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

  test("attribution falls back to item title when itemId does not match", async () => {
    const orderClient: JdOrderClient = {
      async fetchJdOrders() {
        return {
          hasNext: false,
          orders: [
            {
              tbkOrderId: "jd-title-1",
              itemId: "999888777", // 与转化的 mock-item-100 不同
              itemTitle: "Mock Taobao Item", // 与转化标题相同
              payTime: new Date(),
              payAmountCents: 9900,
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

    // 用户查询（转化标题 Mock Taobao Item，itemId mock-item-100），不复制
    await app.inject({
      method: "POST",
      url: "/api/conversions",
      headers: { authorization: "Bearer local_user-1" },
      payload: { rawContent: "https://item.taobao.com/item.htm?id=100" }
    });

    await app.inject({
      method: "POST",
      url: "/api/jobs/sync-tbk-orders",
      headers: { "x-scheduler-token": "dev-scheduler-token" }
    });

    const orders = await app.inject({
      method: "GET",
      url: "/api/orders/me",
      headers: { authorization: "Bearer local_user-1" }
    });
    const matched = orders.json().orders.find((o: { itemTitle: string }) => o.itemTitle === "Mock Taobao Item");
    expect(matched).toBeTruthy();
    expect(matched.userRebateCents).toBeGreaterThan(0);
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

    const taobaoOnly = await app.inject({
      method: "GET",
      url: "/api/admin/conversions?platform=taobao",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(taobaoOnly.json().conversions.length).toBeGreaterThanOrEqual(1);

    const jdOnly = await app.inject({
      method: "GET",
      url: "/api/admin/conversions?platform=jd",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(jdOnly.json().conversions).toHaveLength(0);

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
        referralEnabled: false,
        ordersTabEnabled: true,
        sportsEnabled: true
      }
    });
  });

  test("POST /api/admin/config/sports-enabled updates the public feature switch", async () => {
    const app = await buildTestApp();

    const update = await app.inject({
      method: "POST",
      url: "/api/admin/config/sports-enabled",
      headers: { "x-admin-token": "dev-admin-token" },
      payload: { enabled: false }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toEqual({ ok: true, sportsEnabled: false });

    const publicConfig = await app.inject({ method: "GET", url: "/api/app-config" });
    expect(publicConfig.statusCode).toBe(200);
    expect(publicConfig.json().sportsEnabled).toBe(false);
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

  test("POST /api/admin/deals/ai-parse expands short links before converting", async () => {
    const originalFetch = globalThis.fetch;
    let convertedInput = "";
    const taobaoClient: TaobaoClient = {
      async convert(rawContent: string) {
        convertedInput = rawContent;
        return {
          platform: "taobao",
          itemId: "660000001",
          itemTitle: "植护乳霜纸",
          itemImageUrl: "",
          itemPriceCents: 0,
          commissionRate: 0,
          estimatedCommissionCents: 0,
          generatedPassword: "￥own￥",
          generatedShortUrl: "https://s.click.taobao.com/own",
          generatedClickUrl: "https://uland.taobao.com/own"
        };
      },
      async getProductDetail() {
        return undefined;
      }
    };

    const responseWithUrl = (url: string, body = "") => {
      const response = new Response(body, { status: 200 });
      Object.defineProperty(response, "url", { value: url });
      return response;
    };

    globalThis.fetch = (async (url: string | URL) => {
      const href = String(url);
      if (href === "https://example.com/chat") {
        return new Response(
          JSON.stringify({
            base_resp: { status_code: 0, status_msg: "success" },
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "植护乳霜纸",
                    summary: "基本 0 元",
                    steps: [{ content: "复制链接去拍", copyType: "link", copyValue: "https://upurl.cn/3tqEL7" }]
                  })
                }
              }
            ]
          }),
          { status: 200 }
        );
      }
      if (href === "https://upurl.cn/3tqEL7") {
        return responseWithUrl("https://item.taobao.com/item.htm?id=660000001");
      }
      throw new Error(`unexpected fetch ${href}`);
    }) as typeof fetch;

    try {
      const app = await createApp({
        config: {
          ...testConfig,
          minimaxApiUrl: "https://example.com/chat",
          minimaxApiKey: "test-key",
          minimaxModel: "MiniMax-M3"
        },
        taobaoClient
      });
      apps.push(app);

      const response = await app.inject({
        method: "POST",
        url: "/api/admin/deals/ai-parse",
        headers: { "x-admin-token": "dev-admin-token" },
        payload: { rawContent: "植护乳霜纸 https://upurl.cn/3tqEL7" }
      });

      expect(response.statusCode).toBe(200);
      expect(convertedInput).toBe("https://item.taobao.com/item.htm?id=660000001");
      expect(response.json()).toMatchObject({
        convertedCount: 1,
        deal: { steps: [{ copyType: "password", copyValue: "￥own￥ https://s.click.taobao.com/own" }] }
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("POST /api/admin/deals/ai-parse extracts tkl from iyunzk short-link pages", async () => {
    const originalFetch = globalThis.fetch;
    let convertedInput = "";
    const taobaoClient: TaobaoClient = {
      async convert(rawContent: string) {
        convertedInput = rawContent;
        return {
          platform: "taobao",
          itemId: "660000001",
          itemTitle: "植护乳霜纸",
          itemImageUrl: "",
          itemPriceCents: 0,
          commissionRate: 0,
          estimatedCommissionCents: 0,
          generatedPassword: "￥own-tkl￥",
          generatedShortUrl: "https://s.click.taobao.com/own-tkl",
          generatedClickUrl: "https://uland.taobao.com/own-tkl"
        };
      },
      async getProductDetail() {
        return undefined;
      }
    };

    const responseWithUrl = (url: string, body = "") => {
      const response = new Response(body, { status: 200 });
      Object.defineProperty(response, "url", { value: url });
      return response;
    };

    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href === "https://example.com/chat") {
        return new Response(
          JSON.stringify({
            base_resp: { status_code: 0, status_msg: "success" },
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "植护乳霜纸",
                    summary: "基本 0 元",
                    steps: [{ content: "复制链接下单", copyType: "link", copyValue: "https://upurl.cn/3tqEL7" }]
                  })
                }
              }
            ]
          }),
          { status: 200 }
        );
      }
      if (href === "https://upurl.cn/3tqEL7") {
        return responseWithUrl(
          href,
          '<script>window.location.href = "http://oss.taobyhq.com/?dkey=3tqEL7&tp=s_p&k=2UCZMB#/pages/h5?temp=super_page&k=2UCZMB";</script>'
        );
      }
      if (href === "https://api.cmsv5.iyunzk.com/apis/SuperPage/get") {
        expect(String(init?.body)).toContain("key=2UCZMB");
        return new Response(
          JSON.stringify({
            code: 200,
            data: {
              list: [{ form: [{ field: "tkl", value: "1(RiL5g9WxuRQ)/ AC33" }] }]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`unexpected fetch ${href}`);
    }) as typeof fetch;

    try {
      const app = await createApp({
        config: {
          ...testConfig,
          minimaxApiUrl: "https://example.com/chat",
          minimaxApiKey: "test-key",
          minimaxModel: "MiniMax-M3"
        },
        taobaoClient
      });
      apps.push(app);

      const response = await app.inject({
        method: "POST",
        url: "/api/admin/deals/ai-parse",
        headers: { "x-admin-token": "dev-admin-token" },
        payload: { rawContent: "点击链接下单植护乳霜纸 https://upurl.cn/3tqEL7" }
      });

      expect(response.statusCode).toBe(200);
      expect(convertedInput).toBe("1(RiL5g9WxuRQ)/ AC33");
      expect(response.json()).toMatchObject({
        convertedCount: 1,
        deal: { steps: [{ copyType: "password", copyValue: "￥own-tkl￥ https://s.click.taobao.com/own-tkl" }] }
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
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
