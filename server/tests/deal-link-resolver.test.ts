import { describe, expect, test } from "vitest";
import { resolveDealCopyValue } from "../src/domain/deal-link-resolver.js";

function responseWithUrl(url: string, body = ""): Response {
  const response = new Response(body, { status: 200 });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("deal link resolver", () => {
  test("expands a short link to its final commerce URL", async () => {
    const fetcher = (async (url: string | URL) => {
      expect(String(url)).toBe("https://upurl.cn/3tqEL7");
      return responseWithUrl("https://item.taobao.com/item.htm?id=660000001");
    }) as typeof fetch;

    await expect(resolveDealCopyValue("https://upurl.cn/3tqEL7", fetcher)).resolves.toBe(
      "https://item.taobao.com/item.htm?id=660000001"
    );
  });

  test("extracts a commerce URL from short-link landing HTML", async () => {
    const fetcher = (async () =>
      responseWithUrl(
        "https://upurl.cn/3tqEL7",
        '<html><a href="https://m.tb.cn/h.abc123?tk=xyz">打开淘宝</a></html>'
      )) as typeof fetch;

    await expect(resolveDealCopyValue("https://upurl.cn/3tqEL7", fetcher)).resolves.toBe(
      "https://m.tb.cn/h.abc123?tk=xyz"
    );
  });
});
