import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";
import { MockTaobaoClient } from "../src/integrations/taobao/client.js";

const config: AppConfig = {
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
  zhetaokeApiUrl: "",
  zhetaokeAppKey: "",
  zhetaokeSid: "",
  zhetaokePid: "",
  zhetaokeRelationId: "",
  zhetaokeJdApiUrl: "",
  zhetaokeJdUnionId: "",
  zhetaokeJdPositionId: "",
  jdUnionAppKey: "",
  jdUnionAppSecret: "",
  jdUnionSiteId: "",
  jdUnionPositionId: "",
  jdUnionSceneId: "",
  zhetaokeOrderApiUrl: "",
  minimaxApiUrl: "",
  minimaxApiKey: "",
  minimaxModel: "",
  orderSyncIntervalMinutes: 15,
  orderSyncLookbackMinutes: 170,
  autoSettleThresholdYuan: 20,
  autoSettleDelayDays: 7
};

const ADMIN = { "x-admin-token": "dev-admin-token" };
const sampleArticle = {
  title: "新手省钱教程",
  summary: "从复制口令到查看订单的完整说明",
  coverUrl: "https://example.com/cover.jpg",
  status: "published",
  pinned: false,
  blocks: [
    { type: "heading", text: "准备工作", level: 2 },
    { type: "paragraph", text: "先打开商品页面。", bold: true, align: "left" },
    { type: "image", url: "/uploads/tutorial.jpg", caption: "操作示意图" },
    { type: "quote", text: "价格以商品页实时展示为准。" },
    { type: "list", style: "ordered", items: ["复制链接", "打开淘宝", "完成下单"] },
    { type: "callout", tone: "warning", text: "不要中途更换账号。" },
    { type: "divider" }
  ]
};

describe("articles", () => {
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp() {
    const app = await createApp({ config, taobaoClient: new MockTaobaoClient() });
    apps.push(app);
    return app;
  }

  test("admin creates a rich article and visitors can read it without login", async () => {
    const app = await buildApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/articles",
      headers: ADMIN,
      payload: sampleArticle
    });
    expect(created.statusCode).toBe(200);
    const article = created.json() as { id: string };

    const list = await app.inject({ method: "GET", url: "/api/articles" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      total: 1,
      articles: [{ id: article.id, title: sampleArticle.title, coverUrl: sampleArticle.coverUrl }]
    });

    const detail = await app.inject({ method: "GET", url: `/api/articles/${article.id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      article: {
        blocks: [
          { type: "heading", level: 2 },
          { type: "paragraph", bold: true },
          { type: "image", url: "/uploads/tutorial.jpg" },
          { type: "quote" },
          { type: "list", style: "ordered" },
          { type: "callout", tone: "warning" },
          { type: "divider" }
        ]
      }
    });
  });

  test("drafts stay private and publish/update/delete lifecycle works", async () => {
    const app = await buildApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/articles",
      headers: ADMIN,
      payload: { ...sampleArticle, status: "draft" }
    });
    const article = created.json() as { id: string };

    expect((await app.inject({ method: "GET", url: "/api/articles" })).json()).toMatchObject({ total: 0 });
    expect((await app.inject({ method: "GET", url: `/api/articles/${article.id}` })).statusCode).toBe(404);

    const published = await app.inject({
      method: "PUT",
      url: `/api/admin/articles/${article.id}`,
      headers: ADMIN,
      payload: { ...sampleArticle, title: "更新后的教程" }
    });
    expect(published.statusCode).toBe(200);
    expect(published.json()).toMatchObject({ title: "更新后的教程", status: "published" });

    expect((await app.inject({ method: "DELETE", url: `/api/admin/articles/${article.id}`, headers: ADMIN })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/admin/articles", headers: ADMIN })).json()).toMatchObject({ total: 0 });
  });

  test("counts every view but de-duplicates visitors", async () => {
    const app = await buildApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/articles",
      headers: ADMIN,
      payload: sampleArticle
    });
    const article = created.json() as { id: string };

    for (const visitorId of ["visitor-a", "visitor-a", "visitor-b"]) {
      expect((await app.inject({
        method: "POST",
        url: `/api/articles/${article.id}/view`,
        payload: { visitorId }
      })).statusCode).toBe(200);
    }

    const admin = await app.inject({ method: "GET", url: "/api/admin/articles", headers: ADMIN });
    expect(admin.json()).toMatchObject({
      articles: [{ id: article.id, viewCount: 3, visitorCount: 2 }]
    });
  });

  test("rejects unsafe media URLs and incomplete blocks", async () => {
    const app = await buildApp();
    const unsafe = await app.inject({
      method: "POST",
      url: "/api/admin/articles",
      headers: ADMIN,
      payload: { ...sampleArticle, coverUrl: "http://example.com/cover.jpg" }
    });
    expect(unsafe.statusCode).toBe(400);

    const empty = await app.inject({
      method: "POST",
      url: "/api/admin/articles",
      headers: ADMIN,
      payload: { ...sampleArticle, blocks: [{ type: "paragraph", text: "" }] }
    });
    expect(empty.statusCode).toBe(400);
  });
});
