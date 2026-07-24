import { readFileSync } from "node:fs";
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
});
