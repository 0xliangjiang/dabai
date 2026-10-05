import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import path from "node:path";
const read = (file: string) => readFileSync(path.resolve("..", "sports-miniprogram", file), "utf8");

describe("sports mini-program client", () => {
  test("recovers a consumed ticket with fresh WeChat login after a lost response", async () => {
    const app = { globalData: { apiBaseUrl: "https://example.test", pendingTicket: "a".repeat(64) } };
    const storage = new Map(); const calls: any[] = []; let loginCalls = 0;
    const module = { exports: {} as any };
    const wx = {
      getStorageSync: (k: string) => storage.get(k), setStorageSync: (k: string, v: unknown) => storage.set(k,v), removeStorageSync: (k: string) => storage.delete(k),
      login: (o: any) => o.success({ code: `code-${++loginCalls}` }),
      request: (o: any) => {
        calls.push(o);
        if (o.url.endsWith("/login")) o.success(calls.length === 1 ? { statusCode: 410, data: { error: "expired" } } : { statusCode: 200, data: { token: "sports-session" } });
        else o.success({ statusCode: 200, data: { isBound: true } });
      }
    };
    runInNewContext(read("utils/api.js"), { getApp: () => app, wx, module });
    await module.exports.ensureLogin();
    expect(calls[0].data.ticket).toBe("a".repeat(64));
    expect(calls[1].data.ticket).toBeUndefined();
    expect(calls[0].data.code).not.toBe(calls[1].data.code);
    expect(app.globalData.pendingTicket).toBe("");
    expect(storage.get("sports_session")).toBe("sports-session");
    await module.exports.request("/api/sports/account");
    expect(calls[2].header.authorization).toBe("Bearer sports-session");
    expect(calls.every(c => !c.url.includes("a".repeat(64)))).toBe(true);
  });
  test("gives a clear unavailable message before the new backend is deployed", async () => {
    const module = { exports: {} as any };
    runInNewContext(read("utils/api.js"), { getApp: () => ({ globalData: { apiBaseUrl: "https://example.test" } }), module,
      wx: { request: (o: any) => o.success({ statusCode: 401, data: { error: "unauthorized" } }) } });
    await expect(module.exports.getConfig()).rejects.toMatchObject({ error: "运动服务尚未开放，请稍后再来" });
  });
  test.each([false, undefined, true])("issues an ad grant only for explicit complete viewing: %s", async isEnded => {
    let definition: any; let close: any;
    const request = vi.fn(async () => ({ grantToken: "grant" }));
    const ad = { onClose: (fn: any) => { close = fn; }, onError: () => {}, offClose: () => {}, offError: () => {}, destroy: () => {}, load: async () => {}, show: async () => { close(isEnded === undefined ? undefined : { isEnded }); } };
    runInNewContext(read("pages/home/index.js"), { Page: (d: any) => { definition = d; }, require: () => ({ request }), wx: { createRewardedVideoAd: () => ad } });
    definition.data = { ...definition.data, adUnitId: "adunit-second-app" };
    definition.setData = (d: any) => Object.assign(definition.data, d);
    await definition.watchAd();
    expect(request).toHaveBeenCalledTimes(isEnded === true ? 1 : 0);
    expect(definition.data.grantToken).toBe(isEnded === true ? "grant" : "");
    expect(definition.data.busy).toBe(false);
  });
  test("clears an expired grant so the user can watch another ad", async () => {
    let definition: any;
    const request = vi.fn(async () => ({ success: false, action: "ad_grant_invalid", reply: "请重新观看广告" }));
    runInNewContext(read("pages/home/index.js"), { Page: (d: any) => { definition = d; }, require: () => ({ request }), wx: {} });
    definition.data = { ...definition.data, expired: true, grantToken: "expired-grant", stepsInput: "20000" };
    definition.setData = (d: any) => Object.assign(definition.data, d);
    await definition.submitSteps();
    expect(definition.data.grantToken).toBe("");
    expect(definition.data.error).toBe("请重新观看广告");
  });

  test("returns to binding only in response to the user's explicit button action", () => {
    let definition: any; const navigate = vi.fn();
    runInNewContext(read("pages/home/index.js"), { Page: (d: any) => { definition = d; }, require: () => ({}), wx: { navigateToMiniProgram: navigate }, getApp: () => ({ globalData: { sourceAppId: "wx1111111111111111" } }) });
    expect(navigate).not.toHaveBeenCalled();
    definition.openSource();
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ appId: "wx1111111111111111", path: "pages/sports/index" }));
  });
});
