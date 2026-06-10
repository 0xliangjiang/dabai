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
  zhetaokeApiUrl: "https://api.zhetaoke.com:10001/api/open_gaoyongzhuanlian_tkl.ashx",
  zhetaokeAppKey: "",
  zhetaokeSid: "",
  zhetaokePid: "",
  jdUnionAppKey: "",
  jdUnionAppSecret: "",
  jdUnionSiteId: "",
  jdUnionPositionId: "",


};

const ADMIN = { "x-admin-token": "dev-admin-token" };

describe("deal subscriptions", () => {
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
      payload: { code: "mock-subscribe" }
    });
    const { token } = login.json() as { token: string };
    return { app, auth: { authorization: `Bearer ${token}` } };
  }

  test("subscribe grants are consumed when a deal is published", async () => {
    const { app, auth } = await buildAppWithUser();

    const before = await app.inject({ method: "GET", url: "/api/subscriptions/me", headers: auth });
    expect(before.json()).toMatchObject({ templateId: "dev-deal-template", remaining: 0 });

    const subscribed = await app.inject({ method: "POST", url: "/api/subscriptions", headers: auth });
    expect(subscribed.statusCode).toBe(200);
    expect(subscribed.json()).toMatchObject({ ok: true, remaining: 1 });

    await app.inject({
      method: "POST",
      url: "/api/admin/deals",
      headers: ADMIN,
      payload: {
        title: "发布即通知",
        status: "published",
        steps: [{ content: "第一步" }]
      }
    });

    const after = await app.inject({ method: "GET", url: "/api/subscriptions/me", headers: auth });
    expect(after.json()).toMatchObject({ remaining: 0 });
  });

  test("draft creation does not consume grants; publishing later does", async () => {
    const { app, auth } = await buildAppWithUser();
    await app.inject({ method: "POST", url: "/api/subscriptions", headers: auth });

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/deals",
      headers: ADMIN,
      payload: { title: "先存草稿", status: "draft", steps: [{ content: "第一步" }] }
    });
    const deal = created.json() as { id: string };

    let me = await app.inject({ method: "GET", url: "/api/subscriptions/me", headers: auth });
    expect(me.json()).toMatchObject({ remaining: 1 });

    await app.inject({
      method: "PUT",
      url: `/api/admin/deals/${deal.id}`,
      headers: ADMIN,
      payload: { title: "先存草稿", status: "published", steps: [{ content: "第一步" }] }
    });

    me = await app.inject({ method: "GET", url: "/api/subscriptions/me", headers: auth });
    expect(me.json()).toMatchObject({ remaining: 0 });

    // 再次编辑已发布线报不应再消耗（已无额度，也不应报错）
    await app.inject({
      method: "PUT",
      url: `/api/admin/deals/${deal.id}`,
      headers: ADMIN,
      payload: { title: "改个标题", status: "published", steps: [{ content: "第一步" }] }
    });
  });

  test("multiple grants stack and consume one per publish", async () => {
    const { app, auth } = await buildAppWithUser();
    await app.inject({ method: "POST", url: "/api/subscriptions", headers: auth });
    await app.inject({ method: "POST", url: "/api/subscriptions", headers: auth });

    const payload = { title: "线报A", status: "published", steps: [{ content: "一步" }] };
    await app.inject({ method: "POST", url: "/api/admin/deals", headers: ADMIN, payload });

    let me = await app.inject({ method: "GET", url: "/api/subscriptions/me", headers: auth });
    expect(me.json()).toMatchObject({ remaining: 1 });

    await app.inject({ method: "POST", url: "/api/admin/deals", headers: ADMIN, payload: { ...payload, title: "线报B" } });
    me = await app.inject({ method: "GET", url: "/api/subscriptions/me", headers: auth });
    expect(me.json()).toMatchObject({ remaining: 0 });
  });
});
