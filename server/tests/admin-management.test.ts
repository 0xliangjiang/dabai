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
});
