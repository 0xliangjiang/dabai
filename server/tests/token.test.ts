import { describe, expect, test } from "vitest";
import { signUserToken, verifyUserToken } from "../src/auth/token.js";

const SECRET = "unit-test-secret";

describe("auth token", () => {
  test("round-trips a user id", () => {
    const token = signUserToken("user-42", SECRET);
    expect(verifyUserToken(token, SECRET)).toBe("user-42");
  });

  test("rejects a token signed with a different secret", () => {
    const token = signUserToken("user-42", "other-secret");
    expect(verifyUserToken(token, SECRET)).toBeNull();
  });

  test("rejects a tampered payload", () => {
    const token = signUserToken("user-42", SECRET);
    const [version, , signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: "victim-user", exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString("base64url");
    expect(verifyUserToken(`${version}.${forgedPayload}.${signature}`, SECRET)).toBeNull();
  });

  test("rejects an expired token", () => {
    const token = signUserToken("user-42", SECRET, -10);
    expect(verifyUserToken(token, SECRET)).toBeNull();
  });

  test("rejects malformed tokens", () => {
    expect(verifyUserToken("", SECRET)).toBeNull();
    expect(verifyUserToken("local_user-1", SECRET)).toBeNull();
    expect(verifyUserToken("v1.not-base64", SECRET)).toBeNull();
  });
});
