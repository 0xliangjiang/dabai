import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import path from "node:path";
const read = (file: string) => readFileSync(path.resolve("..", "sports-miniprogram", file), "utf8");

function sportsPage(previewEnabled = true) {
  let definition: any;
  const api = {
    getConfig: vi.fn(async () => ({ enabled: true, sportsEnabled: true, previewEnabled, sourceAppId: "wx1111111111111111" })),
    hasLoginContext: vi.fn(() => false), hasPendingHandoff: vi.fn(() => false),
    ensureLogin: vi.fn(async (): Promise<void> => { throw { code: "LINK_REQUIRED", error: "请先关联账号" }; }),
    request: vi.fn(async () => ({ isBound: true, todayTargetSteps: 12345, membershipExpiresAt: "9999-12-31T23:59:59.999Z" }))
  };
  const app = { globalData: { accountEntryRequested: false } };
  const storage = new Map();
  const wx = { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: any) => storage.set(key, JSON.parse(JSON.stringify(value))) };
  const module = { exports: {} as any };
  runInNewContext(read("utils/goals.js"), { module, wx });
  runInNewContext(read("pages/home/index.js"), { Page: (value: any) => { definition = value; }, require: (name: string) => name.endsWith("goals") ? module.exports : api, wx, getApp: () => app });
  definition.setData = (data: any) => Object.assign(definition.data, data);
  return { definition, api, storage, goals: module.exports, app };
}

describe("sports mini-program client", () => {
  test("disabled public experience keeps real association required", async () => {
    const { definition, api } = sportsPage(false);
    await definition.reload();
    expect(api.ensureLogin).toHaveBeenCalledTimes(1);
    expect(definition.data).toMatchObject({ linked: false, loading: false, error: "请先关联账号" });
    definition.data.stepsInput = "20000";
    await definition.submitSteps();
    expect(api.request).not.toHaveBeenCalled();
    expect(definition.data.error).toContain("请先关联");
  });
  test("enabled public experience needs no login and persists real local goals without calling sports APIs", async () => {
    const { definition, api, goals } = sportsPage(true);
    await definition.reload();
    expect(definition.data).toMatchObject({ previewMode: true, linked: false, loading: false, error: "" });
    expect(api.ensureLogin).not.toHaveBeenCalled(); expect(api.request).not.toHaveBeenCalled();
    definition.data.goalInput = "阅读 20 分钟"; definition.submitGoal();
    expect(goals.readGoals()).toEqual([expect.objectContaining({ title: "阅读 20 分钟", done: false })]);
    expect(definition.data.result).toContain("不修改微信运动");
    definition.data.stepsInput = "20000"; definition.data.grantToken = "existing-grant";
    await definition.submitSteps(); await definition.watchAd();
    expect(api.request).not.toHaveBeenCalled(); expect(definition.data.grantToken).toBe("existing-grant");
  });
  test.each(["cached login", "pending handoff"])("public flag takes priority over %s on a normal entry without consuming credentials", async context => {
    const { definition, api } = sportsPage(true);
    api.hasLoginContext.mockReturnValue(true);
    if (context === "pending handoff") api.hasPendingHandoff.mockReturnValue(true);
    await definition.reload();
    expect(definition.data).toMatchObject({ previewMode: true, linked: false, error: "" });
    expect(api.ensureLogin).not.toHaveBeenCalled(); expect(api.request).not.toHaveBeenCalled();
  });
  test("local storage failure never claims success and preserves goal text", async () => {
    const { definition, api, goals } = sportsPage(true); await definition.reload();
    goals.writeGoals = () => { throw new Error("保存失败"); };
    definition.data.goalInput = "阅读"; definition.submitGoal();
    expect(definition.data).toMatchObject({ result: "", goalInput: "阅读", error: "保存失败" });
    expect(api.request).not.toHaveBeenCalled();
  });
  test("explicit account service requires association even with public experience enabled", async () => {
    const { definition, api } = sportsPage(true); await definition.reload();
    definition.onLoad({ mode: "account" });
    await definition.reload();
    expect(api.ensureLogin).toHaveBeenCalledTimes(1);
    expect(definition.data).toMatchObject({ previewMode: false, linked: false, error: "请先关联账号" });
  });
  test("turning public experience off restores account association and keeps saved goals", async () => {
    const { definition, api, goals } = sportsPage(true); await definition.reload();
    definition.data.goalInput = "整理书架"; definition.submitGoal();
    api.getConfig.mockResolvedValue({ enabled: true, sportsEnabled: true, previewEnabled: false, sourceAppId: "wx1111111111111111" });
    await definition.reload();
    expect(definition.data).toMatchObject({ previewMode: false, previewAvailable: false, linked: false, result: "", goalInput: "" });
    expect(api.ensureLogin).toHaveBeenCalledTimes(1); expect(goals.readGoals()[0].title).toBe("整理书架");
  });
  test.each(["session", "handoff"])("explicit real-service entry retains the existing %s account path", async context => {
    const { definition, api } = sportsPage();
    definition.onLoad({ mode: "account" });
    api.hasLoginContext.mockReturnValue(true);
    api.ensureLogin.mockImplementation(async () => {});
    if (context === "handoff") api.hasPendingHandoff.mockReturnValue(true);
    await definition.reload();
    expect(api.ensureLogin).toHaveBeenCalledTimes(1); expect(api.request).toHaveBeenCalledWith("/api/sports/account");
    expect(definition.data).toMatchObject({ linked: true, todaySteps: 12345, result: "" });
  });
  test("a missing request domain is reported and never generates a fake success", async () => {
    const { definition, api } = sportsPage();
    api.getConfig.mockRejectedValue({ errMsg: "request:fail url not in domain list" });
    await definition.reload();
    expect(definition.data.linked).toBe(false); expect(definition.data.configReady).toBe(false); expect(definition.data.error).toContain("domain list");
    expect(api.ensureLogin).not.toHaveBeenCalled(); expect(api.request).not.toHaveBeenCalled();
  });
  test("a fresh original-app launch into the legacy home route retains real account linking", async () => {
    const { definition, api, app } = sportsPage(true);
    app.globalData.accountEntryRequested = true; api.ensureLogin.mockImplementation(async () => {});
    definition.onLoad({}); definition.onShow();
    await vi.waitFor(() => expect(definition.data.loading).toBe(false));
    expect(definition.data).toMatchObject({ previewMode: false, linked: true });
    expect(app.globalData.accountEntryRequested).toBe(false);
    expect(api.request).toHaveBeenCalledWith("/api/sports/account");
  });
  test("retrying association after the flag is enabled enters public goals instead of forcing login", async () => {
    const { definition, api } = sportsPage(false);
    await definition.reload(); expect(definition.data.linked).toBe(false);
    api.getConfig.mockResolvedValue({ enabled: true, sportsEnabled: true, previewEnabled: true, sourceAppId: "wx1111111111111111" });
    api.ensureLogin.mockClear();
    await definition.useLinkedAccount();
    expect(definition.data).toMatchObject({ previewMode: true, error: "" }); expect(api.ensureLogin).not.toHaveBeenCalled();
    const template = read("pages/home/index.wxml");
    expect(template.indexOf('wx:elif="{{!configReady}}"')).toBeLessThan(template.indexOf('wx:elif="{{!linked}}"'));
    expect(template).toContain('/pages/home/index?mode=account');
  });
  test("manual linking exchanges a fresh WeChat code in the POST body and keeps it out of storage", async () => {
    const app = { globalData: { apiBaseUrl: "https://example.test", pendingTicket: "a".repeat(64) } };
    const storage = new Map(); const calls: any[] = [];
    const module = { exports: {} as any };
    runInNewContext(read("utils/api.js"), { getApp: () => app, module, wx: {
      getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key,value),
      login: (options: any) => options.success({ code: "fresh-wechat-code" }),
      request: (options: any) => { calls.push(options); options.success({ statusCode: 200, data: { token: "sports-session" } }); }
    } });
    await module.exports.linkAccount("ABCDEFGHJKLM");
    expect(calls[0].data).toEqual({ code: "fresh-wechat-code", bindingCode: "ABCDEFGHJKLM" });
    expect(calls[0].url).not.toContain("ABCDEFGHJKLM");
    expect([...storage.entries()]).toEqual([["sports_session", "sports-session"]]);
    expect(app.globalData.pendingTicket).toBe("");
  });
  test("an invalid manual code never falls back to an unrelated cached identity", async () => {
    const storage = new Map(); const request = vi.fn((options: any) => options.success({ statusCode: 410, data: { error: "绑定码已失效" } }));
    const module = { exports: {} as any };
    runInNewContext(read("utils/api.js"), { getApp: () => ({ globalData: { apiBaseUrl: "https://example.test" } }), module, wx: {
      setStorageSync: (key: string, value: unknown) => storage.set(key,value), login: (options: any) => options.success({ code: "fresh-code" }), request
    } });
    await expect(module.exports.linkAccount("ABCDEFGHJKLM")).rejects.toMatchObject({ statusCode: 410 });
    expect(request).toHaveBeenCalledTimes(1); expect(storage.size).toBe(0);
  });
  test("the manual form validates, prevents duplicate submission and loads shared account data", async () => {
    let definition: any; let resolveLink!: () => void;
    const linkAccount = vi.fn(() => new Promise<void>(resolve => { resolveLink = resolve; }));
    const request = vi.fn(async () => ({ isBound: true, account: { email: "source@example.com" }, membershipExpiresAt: "9999-12-31T23:59:59.999Z" }));
    runInNewContext(read("pages/home/index.js"), { Page: (page: any) => { definition = page; }, require: () => ({ linkAccount, request }), wx: {} });
    definition.setData = (data: any) => Object.assign(definition.data, data);
    definition.data.bindingCode = "bad";
    await definition.linkWithCode(); expect(linkAccount).not.toHaveBeenCalled();
    definition.data.bindingCode = "abcd-efgh-jklm";
    const pending = definition.linkWithCode(); await definition.linkWithCode();
    expect(linkAccount).toHaveBeenCalledTimes(1); expect(linkAccount).toHaveBeenCalledWith("ABCDEFGHJKLM");
    resolveLink(); await pending;
    expect(definition.data).toMatchObject({ linked: true, bindingCode: "", busy: false, linking: false, accountName: "source@example.com", membershipText: "永久有效" });
  });
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
    definition.data = { ...definition.data, linked: true, isBound: true, enabled: true, expired: true, grantToken: "expired-grant", stepsInput: "20000" };
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
