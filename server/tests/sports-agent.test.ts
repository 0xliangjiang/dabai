import { describe, expect, test } from "vitest";
import { recognizeSportsIntent } from "../src/domain/sports-agent.js";

describe("sports agent intent recognition", () => {
  test.each([
    ["帮我刷到 20000 步", 20_000],
    ["把步数改成35,000步", 35_000],
    ["今天来个 2.5w 步", 25_000],
    ["刷步三万五千步", 35_000],
    ["设置为５０k步", 50_000],
    ["刷 18888", 18_888],
    ["给我弄到28000步", 28_000]
  ])("recognizes explicit step mutation: %s", (message, steps) => {
    expect(recognizeSportsIntent(message)).toEqual({ type: "set_steps", steps });
  });

  test("asks for a target when the user only says brush steps", () => {
    expect(recognizeSportsIntent("我要刷步")).toEqual({ type: "ask_steps" });
  });

  test("accepts a number-only follow-up after asking for target steps", () => {
    expect(recognizeSportsIntent("两万吧", [
      { role: "user", content: "我要刷步" },
      { role: "assistant", content: "想要设置多少步？" }
    ])).toEqual({ type: "set_steps", steps: 20_000 });
  });

  test.each([
    "今天走了12000步",
    "一万步大概是多少公里",
    "帮我分析最近的步数",
    "刷步上限是多少",
    "怎么刷20000步",
    "不要帮我刷20000步"
  ])("does not mutate for reports, questions or negation: %s", (message) => {
    expect(recognizeSportsIntent(message).type).toBe("chat");
  });
});
