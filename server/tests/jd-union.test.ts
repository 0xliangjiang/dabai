import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { beijingTimestamp, createJdUnionClient, signParams } from "../src/integrations/jd/union.js";

const CONFIG = { appKey: "test-key", appSecret: "test-secret", siteId: "4100183350" };

function wrapResult(method: string, result: unknown) {
  const key = `${method.replace(/\./g, "_")}_responce`;
  return { [key]: { code: "0", getResult: JSON.stringify(result) } };
}

describe("jd union client", () => {
  test("signParams sorts keys and produces uppercase md5 with secret wrapping", () => {
    const params = { b: "2", a: "1", sign: "ignored", empty: "" };
    const expected = createHash("md5").update("secreta1b2secret", "utf8").digest("hex").toUpperCase();
    expect(signParams(params, "secret")).toBe(expected);
  });

  test("beijingTimestamp formats in UTC+8", () => {
    expect(beijingTimestamp(new Date("2026-06-10T16:30:05Z"))).toBe("2026-06-11 00:30:05");
    expect(beijingTimestamp(new Date("2026-06-10T01:02:03Z"))).toBe("2026-06-10 09:02:03");
  });

  test("promotionGet sends signed form and parses nested result string", async () => {
    let captured: URLSearchParams | undefined;
    const client = createJdUnionClient(CONFIG, (async (_url: unknown, init: RequestInit) => {
      captured = new URLSearchParams(init.body as string);
      return new Response(
        JSON.stringify(
          wrapResult("jd.union.open.promotion.common.get", {
            code: 200,
            data: { clickURL: "https://u.jd.com/abc", shortURL: "https://u.jd.com/s" }
          })
        ),
        { status: 200 }
      );
    }) as typeof fetch);

    const result = await client.promotionGet("https://item.jd.com/100012043978.html");
    expect(result).toEqual({ clickUrl: "https://u.jd.com/abc", shortUrl: "https://u.jd.com/s" });
    expect(captured?.get("method")).toBe("jd.union.open.promotion.common.get");
    expect(captured?.get("app_key")).toBe("test-key");
    expect(captured?.get("sign")).toMatch(/^[0-9A-F]{32}$/);
    const biz = JSON.parse(captured?.get("360buy_param_json") ?? "{}");
    expect(biz.promotionCodeReq.siteId).toBe("4100183350");
  });

  test("rejects business errors from nested result", async () => {
    const client = createJdUnionClient(CONFIG, (async () =>
      new Response(
        JSON.stringify(wrapResult("jd.union.open.promotion.common.get", { code: 403, message: "无权限" })),
        { status: 200 }
      )) as typeof fetch);

    await expect(client.promotionGet("x")).rejects.toThrow(/403/);
  });

  test("orderRowQuery returns normalized rows envelope", async () => {
    const client = createJdUnionClient(CONFIG, (async () =>
      new Response(
        JSON.stringify(
          wrapResult("jd.union.open.order.row.query", {
            code: 200,
            hasMore: true,
            data: [{ orderId: 1, skuId: 2 }]
          })
        ),
        { status: 200 }
      )) as typeof fetch);

    const result = await client.orderRowQuery({ startTime: new Date(), endTime: new Date() });
    expect(result.hasMore).toBe(true);
    expect(result.rows).toHaveLength(1);
  });
});
