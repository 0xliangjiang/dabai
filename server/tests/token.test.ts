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

import { resolveDatabaseUrl } from "../src/config/env.js";

describe("resolveDatabaseUrl", () => {
  test("prefers DATABASE_URL when set", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "mysql://a:b@h:3306/d", DB_HOST: "x" } as NodeJS.ProcessEnv)).toBe(
      "mysql://a:b@h:3306/d"
    );
  });

  test("builds url from DB_* parts with encoded password", () => {
    const url = resolveDatabaseUrl({
      DB_HOST: "10.0.0.8",
      DB_USER: "dabai",
      DB_PASSWORD: "p@ss#w:o/rd!?",
      DB_NAME: "dabai"
    } as NodeJS.ProcessEnv);
    expect(url).toBe("mysql://dabai:p%40ss%23w%3Ao%2Frd!%3F@10.0.0.8:3306/dabai");
  });

  test("returns empty when nothing configured", () => {
    expect(resolveDatabaseUrl({} as NodeJS.ProcessEnv)).toBe("");
  });
});
