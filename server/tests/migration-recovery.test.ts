import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";

const serverRoot = path.resolve(import.meta.dirname, "..");

function read(relativePath: string): string {
  return readFileSync(path.join(serverRoot, relativePath), "utf8");
}

describe("production migration recovery", () => {
  test("does not baseline the init migration for every deploy failure", () => {
    const entrypoint = read("docker-entrypoint.sh");

    expect(entrypoint).toContain('grep -q "P3005"');
    expect(entrypoint).toContain('grep -q "20260724180000_articles"');
    expect(entrypoint).toContain("repair-articles-migration.mjs");
    expect(entrypoint).toContain('RESOLVE_ACTION="--rolled-back"');
    expect(entrypoint).toContain('RESOLVE_ACTION="--applied"');
    expect(entrypoint).toContain("has no automatic recovery path");
  });

  test("verifies the known partial migration before resolving it", () => {
    const repair = read("scripts/repair-articles-migration.mjs");

    expect(repair).toContain("CREATE TABLE IF NOT EXISTS");
    expect(repair).toContain("verifyColumns");
    expect(repair).toContain("ensureIndex");
    expect(repair).toContain("ensureArticleForeignKey");
    expect(repair).toContain("finished_at AS finishedAt");
    expect(repair).toContain("rolled_back_at IS NULL");
    expect(repair).toContain("RESOLVE_MODE=");
  });

  test("limits the Prisma pool and retries connection exhaustion", () => {
    const entrypoint = read("docker-entrypoint.sh");
    const script = path.join(serverRoot, "scripts/normalize-database-url.mjs");
    const normalized = execFileSync(process.execPath, [script], {
      encoding: "utf8",
      env: {
        DATABASE_URL: "mysql://user:password@db:3306/dabai"
      }
    });
    const url = new URL(normalized);

    expect(url.searchParams.get("connection_limit")).toBe("5");
    expect(url.searchParams.get("pool_timeout")).toBe("10");
    expect(url.searchParams.get("connect_timeout")).toBe("10");
    expect(entrypoint).toContain('grep -q "Too many connections"');
    expect(entrypoint).toContain("DB_MIGRATION_MAX_ATTEMPTS");
  });

  test("preserves explicitly configured Prisma pool parameters", () => {
    const script = path.join(serverRoot, "scripts/normalize-database-url.mjs");
    const normalized = execFileSync(process.execPath, [script], {
      encoding: "utf8",
      env: {
        DATABASE_URL:
          "mysql://user:password@db:3306/dabai?connection_limit=2&pool_timeout=30&connect_timeout=20",
        DB_CONNECTION_LIMIT: "8"
      }
    });
    const url = new URL(normalized);

    expect(url.searchParams.get("connection_limit")).toBe("2");
    expect(url.searchParams.get("pool_timeout")).toBe("30");
    expect(url.searchParams.get("connect_timeout")).toBe("20");
  });
});
