import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const tabBarSource = readFileSync(resolve(process.cwd(), "../miniprogram/custom-tab-bar/index.js"), "utf8");
const sportsPageSource = readFileSync(resolve(process.cwd(), "../miniprogram/pages/sports/index.js"), "utf8");

describe("mini program sports feature switch", () => {
  test("hides the sports tab before config loads and whenever the switch is disabled", () => {
    expect(tabBarSource).toContain('const INITIAL_LIST = FULL_LIST.filter((item) => item.pagePath !== "/pages/sports/index")');
    expect(tabBarSource).toContain("list: INITIAL_LIST");
    expect(tabBarSource).toContain('if (!sportsEnabled && item.pagePath === "/pages/sports/index") return false');
  });

  test("redirects direct sports-page entry when the switch is disabled", () => {
    expect(sportsPageSource).toContain("if (enabled) return true");
    expect(sportsPageSource).toContain('wx.switchTab({ url: "/pages/home/index" })');
  });
});
