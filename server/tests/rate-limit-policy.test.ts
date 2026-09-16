import { describe, expect, test } from "vitest";
import { rateLimitKey } from "../src/app.js";

describe("rate limit policy", () => {
  test("isolates authenticated users even when they share an IP", () => {
    const first = rateLimitKey({
      headers: { authorization: "Bearer user-token-a" },
      ip: "203.0.113.8"
    });
    const second = rateLimitKey({
      headers: { authorization: "Bearer user-token-b" },
      ip: "203.0.113.8"
    });

    expect(first).not.toBe(second);
    expect(first).not.toContain("user-token-a");
  });

  test("keeps anonymous requests isolated by client IP", () => {
    expect(rateLimitKey({ headers: {}, ip: "203.0.113.8" })).toBe("ip:203.0.113.8");
    expect(rateLimitKey({ headers: {}, ip: "203.0.113.9" })).toBe("ip:203.0.113.9");
  });
});
