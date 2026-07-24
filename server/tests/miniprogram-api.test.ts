import { createRequire } from "node:module";
import { afterEach, describe, expect, test, vi } from "vitest";

const require = createRequire(import.meta.url);
const apiModulePath = require.resolve("../../miniprogram/utils/api.js");

type MiniProgramApi = {
  ensureLogin(): Promise<{ token: string }>;
  request(path: string): Promise<unknown>;
};

function loadApi(wx: Record<string, unknown>): MiniProgramApi {
  delete require.cache[apiModulePath];
  (globalThis as Record<string, unknown>).wx = wx;
  (globalThis as Record<string, unknown>).getApp = () => ({
    globalData: { apiBaseUrl: "https://example.test" }
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
