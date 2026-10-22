import { describe, expect, test } from "vitest";
import { enrichDealText, iyunzkPageText, readDealPage } from "../src/domain/deal-page-reader.js";

describe("activity page reader", () => {
  test("reads all visible activity steps in order before AI and keeps copy tokens and conditions", async () => {
    const fetcher = (async (input: string | URL) => {
      if (String(input) === "https://upurl.cn/2BDCoT") return new Response('<script>window.location.href="http://oss.taobyhq.com/?k=44sw6d";</script>');
      if (String(input).includes("SuperPage/get")) return Response.json({ data: { title: "石头 A30 Max", list: [
        { form: [{ field: "content", value: "<p>❶88vip领1500-150券<br/>1(w7cLTHE3vma)/ AC33</p>" }] },
        { showflag: false, form: [{ field: "content", value: "隐藏过期内容" }] },
        { form: [{ field: "content", value: "<p>❷领礼金不下单 1(7wjBTE7qn9N)/ AC33</p>" }] },
        { form: [{ field: "content", value: "<p>❸下单 tk=SiaWTE7s0xL&nbsp;MF168</p><p>抵扣18496金币，国补，以旧换新</p><p>确认收货不退货咨询客服返现</p>" }] }
      ] } });
      throw new Error("unexpected URL");
    }) as typeof fetch;
    const result = await enrichDealText("799元 https://upurl.cn/2BDCoT", fetcher);
    expect(result.warnings).toEqual([]);
    expect(result.text).toContain("tk=SiaWTE7s0xL MF168");
    expect(result.text).toContain("确认收货不退货咨询客服返现");
    expect(result.text).toContain("18496");
    expect(result.text.indexOf("❶")).toBeLessThan(result.text.indexOf("❷"));
    expect(result.text).not.toContain("隐藏过期内容");
  });

  test("blocks unsupported and private redirects before fetching", async () => {
    let count = 0;
    const fetcher = (async () => { count++; return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }); }) as typeof fetch;
    await expect(readDealPage("https://upurl.cn/test", fetcher)).rejects.toThrow(/域名/);
    expect(count).toBe(1);
    await expect(readDealPage("http://localhost/private", fetcher)).rejects.toThrow(/域名/);
    expect(count).toBe(1);
  });

  test("reports unavailable pages without losing the pasted text", async () => {
    const result = await enrichDealText("原文 https://upurl.cn/test", (async () => new Response("gone", { status: 404 })) as typeof fetch);
    expect(result.text).toBe("原文 https://upurl.cn/test");
    expect(result.warnings[0]).toContain("HTTP 404");
  });

  test("extracts visible HTML and hrefs, and bounds redirect loops", async () => {
    expect(await readDealPage("https://upurl.cn/test", (async () => new Response('<p>领券 &amp; 下单</p><a href="https://m.tb.cn/h.test">复制</a><script>ignore()</script>')) as typeof fetch)).toContain("https://m.tb.cn/h.test");
    await expect(readDealPage("https://upurl.cn/test", (async () => new Response(null, { status: 302, headers: { location: "https://upurl.cn/test" } })) as typeof fetch)).rejects.toThrow(/循环/);
    expect(() => iyunzkPageText({ code: 404 })).toThrow(/失效/);
  });
});
