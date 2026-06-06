import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";
import { MockTaobaoClient } from "../src/integrations/taobao/client.js";

describe("server API", () => {
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
  const testConfig: AppConfig = {
    nodeEnv: "test",
    port: 3001,
    adminToken: "dev-admin-token",
    schedulerToken: "dev-scheduler-token",
    adzoneId: "mock-adzone",
    commissionSharingRatio: 0.5,
    taobaoAppKey: "",
    taobaoAppSecret: "",
    taobaoApiUrl: "https://eco.taobao.com/router/rest"
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
      generatedPassword: "￥mockpassword￥",
      generatedShortUrl: "https://s.click.taobao.com/mock",
      generatedClickUrl: "https://uland.taobao.com/mock"
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
        adzoneId: "mock-adzone",
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
        pendingAttributionCount: 0
      }
    });
  });
});
