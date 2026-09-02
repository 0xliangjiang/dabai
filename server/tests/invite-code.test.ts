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
  wechatAppId: "wx-poster-test",
  wechatAppSecret: "poster-secret",
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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe("invite mini program code", () => {
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  test("returns a cached user-specific unlimited code", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const wechatApiFetch = async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("/cgi-bin/stable_token")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({ force_refresh: false });
        return Response.json({ access_token: "poster-token", expires_in: 7200 });
      }
      return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
    };
    const app = await createApp({
      config,
      taobaoClient: new MockTaobaoClient(),
      wechatAuthFetch: async () => Response.json({ openid: "poster-user-openid" }),
      wechatApiFetch: wechatApiFetch as typeof fetch
    });
    apps.push(app);
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "poster-login-code" }
    });
    const { token, user } = login.json() as { token: string; user: { id: string } };
    const auth = { authorization: `Bearer ${token}` };

    const first = await app.inject({ method: "GET", url: "/api/users/me/invite-code", headers: auth });
    const second = await app.inject({ method: "GET", url: "/api/users/me/invite-code", headers: auth });

    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toContain("image/png");
    expect(first.rawPayload).toEqual(PNG);
    expect(second.rawPayload).toEqual(PNG);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).toMatchObject({
      scene: user.id,
      page: "pages/invite/index",
      check_path: false,
      env_version: "develop"
    });
  });

  test("requires login and hides upstream WeChat errors", async () => {
    const app = await createApp({
      config,
      taobaoClient: new MockTaobaoClient(),
      wechatAuthFetch: async () => Response.json({ openid: "poster-error-openid" }),
      wechatApiFetch: (async (input: string | URL) => {
        if (String(input).includes("/cgi-bin/stable_token")) {
          return Response.json({ access_token: "poster-token", expires_in: 7200 });
        }
        return Response.json({ errcode: 45009, errmsg: "reach max api daily quota" });
      }) as typeof fetch
    });
    apps.push(app);

    const unauthorized = await app.inject({ method: "GET", url: "/api/users/me/invite-code" });
    expect(unauthorized.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "poster-error-login" }
    });
    const { token } = login.json() as { token: string };
    const response = await app.inject({
      method: "GET",
      url: "/api/users/me/invite-code",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "小程序码生成失败，请稍后重试" });
  });

  test("returns the actual image type supplied by WeChat", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const app = await createApp({
      config,
      taobaoClient: new MockTaobaoClient(),
      wechatAuthFetch: async () => Response.json({ openid: "poster-jpeg-openid" }),
      wechatApiFetch: (async (input: string | URL) => {
        if (String(input).includes("/cgi-bin/stable_token")) {
          return Response.json({ access_token: "poster-token", expires_in: 7200 });
        }
        return new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
      }) as typeof fetch
    });
    apps.push(app);

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/wechat-login",
      payload: { code: "poster-jpeg-login" }
    });
    const { token } = login.json() as { token: string };
    const response = await app.inject({
      method: "GET",
      url: "/api/users/me/invite-code",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/jpeg");
    expect(response.headers["content-disposition"]).toContain("invite-code.jpg");
    expect(response.rawPayload).toEqual(jpeg);
  });
});
