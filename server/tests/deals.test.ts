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

const ADMIN = { "x-admin-token": "dev-admin-token" };

const sampleDeal = {
  title: "京东plus会员低价开通",
  summary: "三步搞定",
  status: "published",
  steps: [
    { content: "复制下面的链接，打开京东", copyType: "link", copyValue: "https://example.com/x" },
    { content: "复制口令打开淘宝", copyType: "password", copyValue: "￥abc123￥" },
    { content: "下单后回到小程序查看订单" }
  ]
};

describe("deal posts", () => {
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
      payload: { code: "mock-deals" }
    });
    const { token } = login.json() as { token: string };
    return { app, auth: { authorization: `Bearer ${token}` } };
  }

  test("admin creates, user sees published deal with steps", async () => {
    const { app, auth } = await buildAppWithUser();

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/deals",
      headers: ADMIN,
      payload: sampleDeal
    });
    expect(created.statusCode).toBe(200);
    const deal = created.json() as { id: string };

    const list = await app.inject({ method: "GET", url: "/api/deals", headers: auth });
    expect(list.statusCode).toBe(200);
    const { deals } = list.json() as { deals: Array<{ id: string; stepCount: number }> };
    expect(deals).toHaveLength(1);
    expect(deals[0].stepCount).toBe(3);

    const detail = await app.inject({ method: "GET", url: `/api/deals/${deal.id}`, headers: auth });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      deal: {
        title: sampleDeal.title,
        steps: [
          { copyType: "link", copyValue: "https://example.com/x" },
          { copyType: "password" },
          { content: "下单后回到小程序查看订单" }
        ]
      }
    });
  });

  test("draft deals are hidden from users but visible to admin", async () => {
    const { app, auth } = await buildAppWithUser();

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/deals",
      headers: ADMIN,
      payload: { ...sampleDeal, status: "draft" }
    });
    const deal = created.json() as { id: string };

    const list = await app.inject({ method: "GET", url: "/api/deals", headers: auth });
    expect((list.json() as { deals: unknown[] }).deals).toHaveLength(0);

    const detail = await app.inject({ method: "GET", url: `/api/deals/${deal.id}`, headers: auth });
    expect(detail.statusCode).toBe(404);

    const adminList = await app.inject({ method: "GET", url: "/api/admin/deals", headers: ADMIN });
    expect((adminList.json() as { deals: unknown[] }).deals).toHaveLength(1);
  });

  test("admin can update steps and unpublish, delete removes the deal", async () => {
    const { app, auth } = await buildAppWithUser();

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/deals",
      headers: ADMIN,
      payload: sampleDeal
    });
    const deal = created.json() as { id: string };

    const updated = await app.inject({
      method: "PUT",
      url: `/api/admin/deals/${deal.id}`,
      headers: ADMIN,
      payload: { ...sampleDeal, status: "draft", steps: [{ content: "只剩一步" }] }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ status: "draft", steps: [{ content: "只剩一步" }] });

    const hidden = await app.inject({ method: "GET", url: `/api/deals/${deal.id}`, headers: auth });
    expect(hidden.statusCode).toBe(404);

    const removed = await app.inject({ method: "DELETE", url: `/api/admin/deals/${deal.id}`, headers: ADMIN });
    expect(removed.statusCode).toBe(200);
    const adminList = await app.inject({ method: "GET", url: "/api/admin/deals", headers: ADMIN });
    expect((adminList.json() as { deals: unknown[] }).deals).toHaveLength(0);
  });

  test("pinned deals sort first, others by time desc, publishedAt exposed", async () => {
    const { app, auth } = await buildAppWithUser();

    const first = await app.inject({
      method: "POST",
      url: "/api/admin/deals",
      headers: ADMIN,
      payload: { ...sampleDeal, title: "较早的普通线报" }
    });
    await app.inject({
      method: "POST",
      url: "/api/admin/deals",
      headers: ADMIN,
      payload: { ...sampleDeal, title: "较新的普通线报" }
    });
    await app.inject({
      method: "POST",
      url: "/api/admin/deals",
      headers: ADMIN,
      payload: { ...sampleDeal, title: "置顶线报", pinned: true }
    });

    const list = await app.inject({ method: "GET", url: "/api/deals", headers: auth });
    const { deals } = list.json() as {
      deals: Array<{ title: string; pinned: boolean; publishedAt: string }>;
    };
    expect(deals.map((deal) => deal.title)).toEqual(["置顶线报", "较新的普通线报", "较早的普通线报"]);
    expect(deals[0].pinned).toBe(true);
    expect(deals.every((deal) => Boolean(deal.publishedAt))).toBe(true);

    // 取消置顶后回到时间排序
    const pinnedId = (
      (await app.inject({ method: "GET", url: "/api/admin/deals", headers: ADMIN })).json() as {
        deals: Array<{ id: string; title: string; steps: unknown[] }>;
      }
    ).deals.find((deal) => deal.title === "置顶线报")!;
    await app.inject({
      method: "PUT",
      url: `/api/admin/deals/${pinnedId.id}`,
      headers: ADMIN,
      payload: { ...sampleDeal, title: "置顶线报", pinned: false }
    });
    const after = await app.inject({ method: "GET", url: "/api/deals", headers: auth });
    const titles = (after.json() as { deals: Array<{ title: string }> }).deals.map((deal) => deal.title);
    expect(titles[0]).toBe("置顶线报"); // 它仍是最新发布的，所以时间排序下还在最前

    void first;
  });

  test("rejects deals without steps", async () => {
    const { app } = await buildAppWithUser();
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/deals",
      headers: ADMIN,
      payload: { title: "空线报", status: "published", steps: [] }
    });
    expect(response.statusCode).toBe(400);
  });
});
