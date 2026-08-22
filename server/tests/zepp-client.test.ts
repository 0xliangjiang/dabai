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
      throw new Error(`unexpected URL: ${url}`);
    };

    const client = createZeppClient({ fetchImpl, timeoutMs: 1000 });
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

    const serializedHeaders = requests.map((item) => JSON.stringify(Object.fromEntries(new Headers(item.init?.headers).entries()))).join("\n");
    expect(serializedHeaders).toMatch(/x-forwarded-for/);
    expect(serializedHeaders).toMatch(/cf-connecting-ip/);
  });
});
