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

  test("extracts a tkl from iyunzk super page data", async () => {
    const seen: Array<{ url: string; body?: string }> = [];
    const fetcher = (async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      seen.push({ url: href, body: init?.body ? String(init.body) : undefined });
      if (href === "https://upurl.cn/3tqEL7") {
        return responseWithUrl(
          href,
          '<script>window.location.href = "http://oss.taobyhq.com/?dkey=3tqEL7&tp=s_p&k=2UCZMB#/pages/h5?temp=super_page&k=2UCZMB";</script>'
        );
      }
      if (href === "http://oss.taobyhq.com/?dkey=3tqEL7&tp=s_p&k=2UCZMB#/pages/h5?temp=super_page&k=2UCZMB") {
        return responseWithUrl(href, "<html>super page shell</html>");
      }
      if (href === "https://api.cmsv5.iyunzk.com/apis/SuperPage/get") {
        expect(String(init?.body)).toContain("key=2UCZMB");
        return new Response(
          JSON.stringify({
            code: 200,
            data: {
              list: [
                {
                  tag: "singelbtn_m1",
                  form: [
                    { field: "", value: "兑换3 O亓乳霜纸2包" },
                    { field: "tkl", value: "1(RiL5g9WxuRQ)/ AC33" }
                  ]
                }
              ]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`unexpected fetch ${href}`);
    }) as typeof fetch;

    await expect(resolveDealCopyValue("https://upurl.cn/3tqEL7", fetcher)).resolves.toBe("1(RiL5g9WxuRQ)/ AC33");
    expect(seen.map((x) => x.url)).toContain("https://api.cmsv5.iyunzk.com/apis/SuperPage/get");
  });
});
