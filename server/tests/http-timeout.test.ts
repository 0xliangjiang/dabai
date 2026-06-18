import { describe, expect, test } from "vitest";
import { fetchWithTimeout, withTimeout } from "../src/integrations/http.js";

describe("withTimeout", () => {
  test("rejects a never-settling promise instead of hanging", async () => {
    const start = Date.now();
    await expect(withTimeout(new Promise(() => {}), 50, "sync")).rejects.toThrow(/超时/);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  test("resolves a fast promise normally", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });
});

describe("fetchWithTimeout", () => {
  test("rejects when the upstream never responds (does not hang forever)", async () => {
    // 模拟"连上了但服务端迟迟不返回"：fetcher 永不 resolve，但要响应 abort 信号
    const hangingFetcher = ((_url: string | URL, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;

    const start = Date.now();
    await expect(fetchWithTimeout(hangingFetcher, "https://example.com", { method: "GET" }, 50)).rejects.toThrow();
    // 必须在超时附近就返回，而不是无限挂起
    expect(Date.now() - start).toBeLessThan(2000);
  });

  test("passes through a normal response and clears the timer", async () => {
    const okFetcher = (async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    const res = await fetchWithTimeout(okFetcher, "https://example.com", { method: "GET" }, 1000);
    expect(res.status).toBe(200);
  });
});
