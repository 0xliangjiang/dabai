import { describe, expect, test } from "vitest";
import { createDealAiParser, MinimaxError } from "../src/integrations/minimax/client.js";

const CONFIG = { apiUrl: "https://example.com/chat", apiKey: "test-key", model: "MiniMax-M3" };

function minimaxResponse(content: string) {
  return new Response(
    JSON.stringify({ base_resp: { status_code: 0, status_msg: "success" }, choices: [{ message: { content } }] }),
    { status: 200 }
  );
}

describe("MiniMax deal parser", () => {
  test("parses clean JSON into a structured deal", async () => {
    const parser = createDealAiParser(
      CONFIG,
      (async () =>
        minimaxResponse(
          JSON.stringify({
            title: "优衣库速干短袖补货",
            summary: "39 一件任选",
            steps: [{ content: "复制链接去抢", copyType: "link", copyValue: "https://upurl.cn/32ea7a" }]
          })
        )) as unknown as typeof fetch
    );

    const deal = await parser.parseDealFromText("优衣库补了 速干短袖 https://upurl.cn/32ea7a");
    expect(deal.title).toBe("优衣库速干短袖补货");
    expect(deal.steps).toHaveLength(1);
    expect(deal.steps[0].copyType).toBe("link");
    expect(deal.steps[0].copyValue).toBe("https://upurl.cn/32ea7a");
  });

  test("strips markdown fences and infers copyType from value", async () => {
    const parser = createDealAiParser(
      CONFIG,
      (async () =>
        minimaxResponse(
          "```json\n" +
            JSON.stringify({
              title: "测试",
              summary: "",
              steps: [{ content: "打开淘宝", copyType: null, copyValue: "￥abc￥" }]
            }) +
            "\n```"
        )) as unknown as typeof fetch
    );

    const deal = await parser.parseDealFromText("测试 ￥abc￥");
    expect(deal.steps[0].copyType).toBe("password");
  });

  test("throws on empty input", async () => {
    const parser = createDealAiParser(CONFIG, (async () => minimaxResponse("{}")) as unknown as typeof fetch);
    await expect(parser.parseDealFromText("   ")).rejects.toThrow(MinimaxError);
  });

  test("throws when not configured", async () => {
    const parser = createDealAiParser(
      { ...CONFIG, apiKey: "" },
      (async () => minimaxResponse("{}")) as unknown as typeof fetch
    );
    await expect(parser.parseDealFromText("x")).rejects.toThrow(/未配置/);
  });

  test("throws a friendly error on unparseable content", async () => {
    const parser = createDealAiParser(
      CONFIG,
      (async () => minimaxResponse("抱歉我无法识别")) as unknown as typeof fetch
    );
    await expect(parser.parseDealFromText("x")).rejects.toThrow(MinimaxError);
  });
});
