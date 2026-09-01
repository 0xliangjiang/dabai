import { createRequire } from "node:module";
import { afterEach, describe, expect, test, vi } from "vitest";

const require = createRequire(import.meta.url);
const apiModulePath = require.resolve("../../miniprogram/utils/api.js");

type MiniProgramApi = {
  ensureLogin(): Promise<{ token: string }>;
  getAppConfig(): Promise<Record<string, unknown>>;
  request(path: string): Promise<unknown>;
};

function loadApi(
  wx: Record<string, unknown>,
  globalData: Record<string, unknown> = { apiBaseUrl: "https://example.test" }
): MiniProgramApi {
  delete require.cache[apiModulePath];
  (globalThis as Record<string, unknown>).wx = wx;
  if (!globalData.apiBaseUrl) globalData.apiBaseUrl = "https://example.test";
  (globalThis as Record<string, unknown>).getApp = () => ({
    globalData
  });
  return require(apiModulePath) as MiniProgramApi;
}

function createStorage() {
  const values = new Map<string, unknown>();
  return {
    values,
    getStorageSync: (key: string) => values.get(key) ?? "",
    setStorageSync: (key: string, value: unknown) => values.set(key, value),
    removeStorageSync: (key: string) => values.delete(key)
  };
}

afterEach(() => {
  delete require.cache[apiModulePath];
  delete (globalThis as Record<string, unknown>).wx;
  delete (globalThis as Record<string, unknown>).getApp;
  vi.useRealTimers();
});

describe("mini program login client", () => {
  test("coalesces concurrent app-config requests and reuses the short-lived result", async () => {
    const storage = createStorage();
    let resolveRequest: ((result: { statusCode: number; data: unknown }) => void) | undefined;
    const request = vi.fn((options: {
      success: (result: { statusCode: number; data: unknown }) => void;
    }) => {
      resolveRequest = options.success;
    });
    const api = loadApi({ ...storage, request });

    const first = api.getAppConfig();
    const second = api.getAppConfig();
    expect(second).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);

    resolveRequest?.({ statusCode: 200, data: { sportsEnabled: true } });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { sportsEnabled: true },
      { sportsEnabled: true }
    ]);

    await expect(api.getAppConfig()).resolves.toEqual({ sportsEnabled: true });
    expect(request).toHaveBeenCalledTimes(1);
  });

  test("does not call wx.login in timeline single-page mode", async () => {
    const storage = createStorage();
    const login = vi.fn();
    const api = loadApi({ ...storage, login }, { singlePageMode: true });

    await expect(api.ensureLogin()).rejects.toMatchObject({ code: "TIMELINE_SINGLE_PAGE" });
    expect(login).not.toHaveBeenCalled();
  });

  test("uses the inviter preserved by App when creating a new session", async () => {
    const storage = createStorage();
    let loginPayload: { inviterId?: string } | null = null;
    const globalData = { pendingInviter: "inviter-from-timeline" };
    const api = loadApi({
      ...storage,
      login({ success }: { success: (result: { code: string }) => void }) {
        success({ code: "fresh-code" });
      },
      request(options: {
        data: { inviterId?: string };
        success: (result: { statusCode: number; data: unknown }) => void;
      }) {
        loginPayload = options.data;
        options.success({
          statusCode: 200,
          data: {
            token: "new-token",
            user: { id: "new-user", inviterId: "inviter-from-timeline" }
          }
        });
      }
    }, globalData);

    await expect(api.ensureLogin()).resolves.toMatchObject({
      user: { inviterId: "inviter-from-timeline" }
    });
    expect(loginPayload).toMatchObject({ inviterId: "inviter-from-timeline" });
    expect(globalData.pendingInviter).toBe("");
  });

  test("gets a fresh WeChat code for each transient login retry", async () => {
    vi.useFakeTimers();
    const storage = createStorage();
    let loginCalls = 0;
    let requestCalls = 0;
    const api = loadApi({
      ...storage,
      login({ success }: { success: (result: { code: string }) => void }) {
        loginCalls += 1;
        success({ code: `code-${loginCalls}` });
      },
      request({ success }: { success: (result: { statusCode: number; data: unknown }) => void }) {
        requestCalls += 1;
        if (requestCalls < 3) {
          success({ statusCode: 401, data: { error: "temporary login failure" } });
          return;
        }
        success({
          statusCode: 200,
          data: { token: "fresh-token", user: { id: "new-user" } }
        });
      }
    });

    const pending = api.ensureLogin();
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ token: "fresh-token" });
    expect(loginCalls).toBe(3);
    expect(requestCalls).toBe(3);
    expect(storage.values.get("token")).toBe("fresh-token");
  });

  test("a late 401 from an old token does not clear a freshly renewed token", async () => {
    const storage = createStorage();
    storage.values.set("token", "old-token");
    let loginCalls = 0;
    let oldTokenRequests = 0;
    const api = loadApi({
      ...storage,
      login({ success }: { success: (result: { code: string }) => void }) {
        loginCalls += 1;
        success({ code: `renew-${loginCalls}` });
      },
      request(options: {
        url: string;
        header: { authorization?: string };
        success: (result: { statusCode: number; data: unknown }) => void;
      }) {
        if (options.url.endsWith("/api/auth/wechat-login")) {
          options.success({
            statusCode: 200,
            data: { token: "new-token", user: { id: "user-1" } }
          });
          return;
        }
        if (options.header.authorization === "Bearer old-token") {
          oldTokenRequests += 1;
          const delay = oldTokenRequests === 1 ? 0 : 20;
          setTimeout(() => options.success({ statusCode: 401, data: { error: "expired" } }), delay);
          return;
        }
        options.success({ statusCode: 200, data: { ok: true } });
      }
    });

    const results = await Promise.all([api.request("/protected"), api.request("/protected")]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(loginCalls).toBe(1);
    expect(storage.values.get("token")).toBe("new-token");
  });
});
