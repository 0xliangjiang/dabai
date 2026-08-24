import { createRequire } from "node:module";
import { afterEach, describe, expect, test, vi } from "vitest";

const require = createRequire(import.meta.url);
const appModulePath = require.resolve("../../miniprogram/app.js");

type MiniProgramApp = {
  globalData: {
    launchScene: number;
    singlePageMode: boolean;
    pendingInviter: string;
  };
  onLaunch(options: unknown): void;
  onShow(options: unknown): void;
};

afterEach(() => {
  delete require.cache[appModulePath];
  delete (globalThis as Record<string, unknown>).wx;
  delete (globalThis as Record<string, unknown>).App;
  delete (globalThis as Record<string, unknown>).getCurrentPages;
  vi.useRealTimers();
});

describe("mini program timeline invitation entry", () => {
  test("keeps inviter without attempting login in timeline single-page mode", () => {
    const storage = new Map<string, unknown>();
    let app: MiniProgramApp | null = null;
    const reLaunch = vi.fn();
    (globalThis as Record<string, unknown>).wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }),
      getStorageSync: (key: string) => storage.get(key) ?? "",
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      reLaunch
    };
    (globalThis as Record<string, unknown>).getCurrentPages = () => [];
    (globalThis as Record<string, unknown>).App = (definition: MiniProgramApp) => {
      app = definition;
    };

    require(appModulePath);
    expect(app).not.toBeNull();
    app!.onLaunch({ scene: 1154, query: { inviter: "inviter-1" } });

    expect(app!.globalData.singlePageMode).toBe(true);
    expect(app!.globalData.pendingInviter).toBe("inviter-1");
    expect(storage.get("pending_inviter")).toBe("inviter-1");
    expect(reLaunch).not.toHaveBeenCalled();
  });

  test("routes an unauthenticated invited visitor to the login landing page in full mode", async () => {
    vi.useFakeTimers();
    const storage = new Map<string, unknown>([["pending_inviter", "inviter-2"]]);
    let app: MiniProgramApp | null = null;
    const reLaunch = vi.fn(({ complete }: { complete?: () => void }) => complete?.());
    (globalThis as Record<string, unknown>).wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }),
      getStorageSync: (key: string) => storage.get(key) ?? "",
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      reLaunch
    };
    (globalThis as Record<string, unknown>).getCurrentPages = () => [{ route: "pages/home/index" }];
    (globalThis as Record<string, unknown>).App = (definition: MiniProgramApp) => {
      app = definition;
    };

    require(appModulePath);
    app!.onShow({ scene: 1001, query: {} });
    await vi.runAllTimersAsync();

    expect(app!.globalData.singlePageMode).toBe(false);
    expect(reLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/pages/invite/index?inviter=inviter-2"
      })
    );
  });

  test("does not route an already logged-in user through the invitation login page", async () => {
    vi.useFakeTimers();
    const storage = new Map<string, unknown>([
      ["token", "existing-token"],
      ["pending_inviter", "another-user"]
    ]);
    let app: MiniProgramApp | null = null;
    const reLaunch = vi.fn();
    (globalThis as Record<string, unknown>).wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }),
      getStorageSync: (key: string) => storage.get(key) ?? "",
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      reLaunch
    };
    (globalThis as Record<string, unknown>).getCurrentPages = () => [{ route: "pages/home/index" }];
    (globalThis as Record<string, unknown>).App = (definition: MiniProgramApp) => {
      app = definition;
    };

    require(appModulePath);
    app!.onShow({ scene: 1001, query: {} });
    await vi.runAllTimersAsync();

    expect(reLaunch).not.toHaveBeenCalled();
  });

  test("keeps a sports invitee on the sports page so login can bind the inviter", async () => {
    vi.useFakeTimers();
    const storage = new Map<string, unknown>([["pending_inviter", "sports-inviter"]]);
    let app: MiniProgramApp | null = null;
    const reLaunch = vi.fn();
    (globalThis as Record<string, unknown>).wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }),
      getStorageSync: (key: string) => storage.get(key) ?? "",
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      reLaunch
    };
    (globalThis as Record<string, unknown>).getCurrentPages = () => [{ route: "pages/sports/index" }];
    (globalThis as Record<string, unknown>).App = (definition: MiniProgramApp) => {
      app = definition;
    };

    require(appModulePath);
    app!.onShow({ scene: 1007, query: { inviter: "sports-inviter" } });
    await vi.runAllTimersAsync();

    expect(app!.globalData.pendingInviter).toBe("sports-inviter");
    expect(reLaunch).not.toHaveBeenCalled();
  });
});
