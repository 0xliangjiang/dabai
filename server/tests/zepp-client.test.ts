import { describe, expect, test } from "vitest";
import { createZeppClient } from "../src/integrations/zepp/client.js";

describe("Zepp client", () => {
  test("ports captcha, registration, login and WeChat binding requests with AI-Step headers", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.includes("/captcha/register")) {
        return new Response(Uint8Array.from([1, 2, 3]), {
          status: 200,
          headers: { "captcha-key": "captcha-key" }
        });
      }
      if (url.endsWith("/v2/registrations/tokens")) {
        return new Response(null, {
          status: 303,
          headers: { location: "https://example.test/callback?access=login-access" }
        });
      }
      if (url.includes("/registrations/")) {
        return Response.json({
          data: "https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html?access=access-code"
        });
      }
      if (url.endsWith("/v1/client/register")) {
        return Response.json({ result: "ok", token_info: { user_id: "zepp-1" } });
      }
      if (url.endsWith("/v2/client/login")) {
        return Response.json({
          token_info: {
            user_id: "zepp-1",
            login_token: "login-token",
            app_token: "app-token"
          }
        });
      }
      if (url.includes("/v1/bind/qrcode.json")) {
        return Response.json({ code: 1, data: { ticket: "ticket-1" } });
      }
      if (url.includes("/v1/info/users.json")) {
        return Response.json({ code: 1, data: { isbind: 1 } });
      }
      if (url.includes("api.nan.run/api/xiaomisport")) {
        const requestUrl = new URL(url);
        expect(requestUrl.searchParams.get("user")).toBe("sport@example.com");
        expect(requestUrl.searchParams.get("pass")).toBe("password");
        expect(requestUrl.searchParams.get("step")).toBe("20000");
        return Response.json({ code: 200, msg: "success", step: 20_000 });
      }
      throw new Error(`unexpected URL: ${url}`);
    };

    const client = createZeppClient({ fetchImpl, timeoutMs: 1000, nanrunApiKey: "test-nanrun-key" });
    const captcha = await client.getRegistrationCaptcha();
    expect(captcha).toEqual({ key: "captcha-key", imageBase64: "AQID" });

    await client.registerAccount({
      email: "sport@example.com",
      password: "password",
      name: "运动用户",
      captchaKey: captcha.key,
      captchaCode: "a7b9"
    });
    await expect(client.login("sport@example.com", "password")).resolves.toMatchObject({ userId: "zepp-1" });
    await expect(client.getBindTicket("zepp-1")).resolves.toBe("ticket-1");
    await expect(client.checkBindStatus("zepp-1")).resolves.toBe(true);
    await expect(client.updateSteps({ email: "sport@example.com", password: "password", steps: 20_000 }))
      .resolves.toMatchObject({ steps: 20_000 });

    const registrationRequests = requests.filter((item) =>
      item.url.includes("/captcha/register") ||
      item.url.startsWith("https://api-user.huami.com/registrations/") ||
      item.url.endsWith("/v1/client/register")
    );
    const registrationSpoofIps = registrationRequests.map((item) =>
      new Headers(item.init?.headers).get("x-forwarded-for")
    );
    expect(registrationSpoofIps).toHaveLength(3);
    expect(new Set(registrationSpoofIps).size).toBe(1);

    const stepRequest = requests.find((item) => item.url.includes("api.nan.run/api/xiaomisport"));
    expect(stepRequest?.init?.method).toBeUndefined();

    const serializedHeaders = requests.map((item) => JSON.stringify(Object.fromEntries(new Headers(item.init?.headers).entries()))).join("\n");
    expect(serializedHeaders).toMatch(/x-forwarded-for/);
    expect(serializedHeaders).toMatch(/cf-connecting-ip/);
  });

  test("starts a new captcha transport after connection failure and pins the successful transport", async () => {
    const captchaIps: Array<string | null> = [];
    let registrationIp: string | null = null;
    const client = createZeppClient({ fetchImpl: async (input, init) => {
      const url = String(input);
      const ip = new Headers(init?.headers).get("x-forwarded-for");
      if (url.includes("/captcha/register")) {
        captchaIps.push(ip);
        if (captchaIps.length < 3) throw new TypeError("connection failed");
        return new Response(Uint8Array.from([1]), { headers: { "captcha-key": "new-session" } });
      }
      registrationIp = ip;
      if (url.endsWith("/v1/client/register")) return Response.json({ result: "ok", token_info: { user_id: "user" } });
      return Response.json({ data: "https://example.test/?access=code" });
    } });
    const captcha = await client.getRegistrationCaptcha();
    await client.registerAccount({ email: "user@example.com", password: "password", name: "user",
      captchaKey: captcha.key, captchaCode: "abcd" });
    expect(captchaIps).toHaveLength(3);
    expect(captchaIps[0]).toBe(captchaIps[1]);
    expect(captchaIps[2]).not.toBe(captchaIps[0]);
    expect(registrationIp).toBe(captchaIps[2]);
  });

  test("retries transient binding failures and uses a fresh timeout for each attempt", async () => {
    const signals: AbortSignal[] = [];
    let calls = 0;
    const client = createZeppClient({ timeoutMs: 1000, fetchImpl: async (_url, init) => {
      signals.push(init!.signal!);
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return Response.json({ code: 1, data: { isbind: 1 } });
    } });
    await expect(client.checkBindStatus("user")).resolves.toBe(true);
    expect(calls).toBe(2);
    expect(signals[0]).not.toBe(signals[1]);
  });

  test("reports binding outages after two attempts with a safe public error", async () => {
    let calls = 0;
    const client = createZeppClient({ fetchImpl: async () => {
      calls += 1;
      return new Response("unavailable", { status: 503 });
    } });
    await expect(client.getBindTicket("private-user-id")).rejects.toMatchObject({
      code: "ZEPP_BINDING_UNAVAILABLE", message: "微信绑定服务暂时连接失败，请稍后重试"
    });
    expect(calls).toBe(2);
  });

  test("rejects registration when its captcha transport session is missing", async () => {
    const client = createZeppClient({
      fetchImpl: async () => { throw new Error("registration request should not be sent"); },
      timeoutMs: 1000
    });

    await expect(client.registerAccount({
      email: "sport@example.com",
      password: "password",
      name: "运动用户",
      captchaKey: "unknown-captcha-key",
      captchaCode: "a7b9"
    })).rejects.toMatchObject({
      code: "ZEPP_REGISTRATION_SESSION_EXPIRED",
      message: "验证码会话已失效，请重新获取验证码"
    });
  });
});
