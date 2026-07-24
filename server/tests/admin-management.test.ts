import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";
import { MockTaobaoClient } from "../src/integrations/taobao/client.js";

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

describe("user management and claim review", () => {
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];

  async function buildApp() {
    const app = await createApp({ config: testConfig, taobaoClient: new MockTaobaoClient() });
    apps.push(app);
    return app;
  }

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function loginUser(app: Awaited<ReturnType<typeof createApp>>) {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "mock-ban-test" }
    });
    return response.json() as { token: string; user: { id: string } };
  }

  test("banned user is rejected with 403 and can be unbanned", async () => {
    const app = await buildApp();
    const { token, user } = await loginUser(app);

    const okResponse = await app.inject({
      method: "GET",
      url: "/api/orders/me",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(okResponse.statusCode).toBe(200);

    const banResponse = await app.inject({
      method: "POST",
      url: `/api/admin/users/${user.id}/status`,
      headers: { "x-admin-token": "dev-admin-token" },
      payload: { status: "banned" }
    });
    expect(banResponse.statusCode).toBe(200);
    expect(banResponse.json()).toMatchObject({ status: "banned" });

    const blockedResponse = await app.inject({
      method: "GET",
      url: "/api/orders/me",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(blockedResponse.statusCode).toBe(403);

    await app.inject({
      method: "POST",
      url: `/api/admin/users/${user.id}/status`,
      headers: { "x-admin-token": "dev-admin-token" },
      payload: { status: "active" }
    });

    const restoredResponse = await app.inject({
      method: "GET",
      url: "/api/orders/me",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(restoredResponse.statusCode).toBe(200);
  });

  test("deleted user reappears (revived) when they use the app again", async () => {
    const app = await buildApp();
    const { token, user } = await loginUser(app);

    // 后台软删除
    const del = await app.inject({
      method: "DELETE",
      url: `/api/admin/users/${user.id}`,
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(del.statusCode).toBe(200);

    // 删除后后台列表看不到
    const listAfterDelete = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(listAfterDelete.json().users.find((u: { id: string }) => u.id === user.id)).toBeUndefined();

    // 用户带着原 token 再次使用 app（不重新登录）→ 自动复活
    const reuse = await app.inject({
      method: "GET",
      url: "/api/orders/me",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(reuse.statusCode).toBe(200);

    // 现在后台又能看到、可管理
    const listAfterReuse = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(listAfterReuse.json().users.find((u: { id: string }) => u.id === user.id)).toBeTruthy();
  });

  test("rejects invalid user status values", async () => {
    const app = await buildApp();
    const { user } = await loginUser(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/users/${user.id}/status`,
      headers: { "x-admin-token": "dev-admin-token" },
      payload: { status: "vip" }
    });
    expect(response.statusCode).toBe(400);
  });

  test("admin can list and review order claims", async () => {
    const app = await buildApp();
    const { token } = await loginUser(app);

    const claimResponse = await app.inject({
      method: "POST",
      url: "/api/orders/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: { orderSuffix: "8888", notes: "漏单了", screenshotUrl: "/uploads/test.jpg" }
    });
    expect(claimResponse.statusCode).toBe(200);
    const claim = claimResponse.json() as { id: string };

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/admin/claims?status=pending_review",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(listResponse.statusCode).toBe(200);
    const { claims } = listResponse.json() as { claims: Array<{ id: string; userOpenid: string }> };
    expect(claims).toHaveLength(1);
    expect(claims[0].userOpenid).toContain("mock_openid_");

    const reviewResponse = await app.inject({
      method: "POST",
      url: `/api/admin/claims/${claim.id}/review`,
      headers: { "x-admin-token": "dev-admin-token" },
      payload: { status: "approved" }
    });
    expect(reviewResponse.statusCode).toBe(200);
    expect(reviewResponse.json()).toMatchObject({ status: "approved" });

    const pendingAfter = await app.inject({
      method: "GET",
      url: "/api/admin/claims?status=pending_review",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect((pendingAfter.json() as { claims: unknown[] }).claims).toHaveLength(0);
  });

  test("user can update nickname and avatar, visible to admin", async () => {
    const app = await buildApp();
    const { token } = await loginUser(app);

    const updateResponse = await app.inject({
      method: "POST",
      url: "/api/users/me/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: { nickname: "大白测试", avatarUrl: "/uploads/avatar.png" }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      user: { nickname: "大白测试", avatarUrl: "/uploads/avatar.png" }
    });

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/users/me",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(meResponse.json()).toMatchObject({ user: { nickname: "大白测试" } });

    const adminUsers = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    const { users } = adminUsers.json() as { users: Array<{ nickname: string | null }> };
    expect(users[0].nickname).toBe("大白测试");
  });

  test("profile update rejects bad avatar urls and empty payloads", async () => {
    const app = await buildApp();
    const { token } = await loginUser(app);

    const badUrl = await app.inject({
      method: "POST",
      url: "/api/users/me/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarUrl: "http://evil.example.com/a.png" }
    });
    expect(badUrl.statusCode).toBe(400);

    const empty = await app.inject({
      method: "POST",
      url: "/api/users/me/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });
    expect(empty.statusCode).toBe(400);
  });

  test("claim rejects http screenshot urls outside uploads", async () => {
    const app = await buildApp();
    const { token } = await loginUser(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/orders/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: { orderSuffix: "8888", screenshotUrl: "http://evil.example.com/x.jpg" }
    });
    expect(response.statusCode).toBe(400);
  });

  test("admin user detail includes balance, orders, withdrawals and downlines", async () => {
    const app = await buildApp();
    const parent = await app.deps.repositories.users.findOrCreateByOpenid("detail-parent");
    await app.deps.repositories.users.findOrCreateByOpenid("detail-child", { inviterId: parent.id });
    const order = await app.deps.repositories.orders.upsert({
      tbkOrderId: "detail-order-001",
      itemId: "detail-item",
      itemTitle: "用户详情测试商品",
      payTime: new Date("2026-07-24T08:00:00Z"),
      payAmountCents: 2990,
      estimatedCommissionCents: 300,
      settledCommissionCents: null,
      orderStatus: "paid",
      rawPayload: {}
    });
    await app.deps.repositories.orders.upsertAttribution({
      tbkOrderId: order.tbkOrderId,
      status: "manual_matched",
      confidence: 1,
      reason: "admin_test",
      userId: parent.id
    });
    await app.inject({
      method: "POST",
      url: `/api/admin/users/${parent.id}/adjust-points`,
      headers: { "x-admin-token": "dev-admin-token" },
      payload: { delta: 10, reason: "detail-test" }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/admin/users/${parent.id}/detail`,
      headers: { "x-admin-token": "dev-admin-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: { id: parent.id, openid: "detail-parent" },
      balance: { availableCents: 1000, availableRewardValue: 10 },
      orders: { total: 1, page: 1, items: [{ orderNumber: "detail-order-001" }] },
      downlines: { total: 1, page: 1, items: [{ openid: "detail-child" }] },
      withdrawals: { total: 0, items: [] }
    });
  });

  test("admin user detail returns 404 for an unknown user", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/users/missing-user/detail",
      headers: { "x-admin-token": "dev-admin-token" }
    });
    expect(response.statusCode).toBe(404);
  });
});
