import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const sportsPage = readFileSync(
  path.resolve(process.cwd(), "../miniprogram/pages/sports/index.js"),
  "utf8"
);

describe("mini program sports membership refresh", () => {
  test("refreshes the displayed membership expiry after redeeming an access code", () => {
    expect(sportsPage).toContain('result.action === "access_code_redeemed"');
    expect(sportsPage).toContain("membershipExpiresAt: formatDate(result.membershipExpiresAt)");
    expect(sportsPage).toContain("await this.loadAccount()");
    expect(sportsPage).toContain('title: "会员有效期已更新"');
  });

  test("shows all three expiry recovery paths and retries the pending target after an ad", () => {
    expect(sportsPage).toContain("handleWatchAd");
    expect(sportsPage).toContain('accessGrantToken: reward.grantToken');
    expect(sportsPage).toContain("redeemAccessCode");
    expect(sportsPage).toContain("onShareAppMessage");
    expect(sportsPage).toContain("pendingExpiredMessage: text");
  });
});
