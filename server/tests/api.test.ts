import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";

describe("server API", () => {
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];

  async function buildTestApp() {
    const app = await createApp();
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
});
