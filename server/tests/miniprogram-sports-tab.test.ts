import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const tabBarSource = readFileSync(resolve(process.cwd(), "../miniprogram/custom-tab-bar/index.js"), "utf8");
const sportsPageSource = readFileSync(resolve(process.cwd(), "../miniprogram/pages/sports/index.js"), "utf8");
const sportsPageTemplate = readFileSync(resolve(process.cwd(), "../miniprogram/pages/sports/index.wxml"), "utf8");
const apiSource = readFileSync(resolve(process.cwd(), "../miniprogram/utils/api.js"), "utf8");
const fullListSource = tabBarSource.match(/const FULL_LIST = \[[\s\S]*?\n\];/)?.[0] ?? "";

describe("mini program sports feature switch", () => {
  test("keeps the sports tab visible independently from the account-service switch", () => {
    expect(tabBarSource).toContain("const INITIAL_STATE = createTabState(true)");
    expect(tabBarSource).toContain("list: INITIAL_STATE.list");
    expect(tabBarSource).toMatch(/attached\(\)\s*{[\s\S]*?this\.applyConfig\(\)/);
    expect(fullListSource).toContain('pagePath: "/pages/sports/index"');
    expect(tabBarSource).not.toContain('if (!sportsEnabled && item.pagePath === "/pages/sports/index")');
  });

  test("derives the active tab from the current route when rebuilding the list", () => {
    expect(fullListSource).not.toContain("activeClass");
    expect(tabBarSource).toContain("const selected = visibleList.findIndex((item) => item.pagePath === route)");
    expect(tabBarSource).toContain('activeClass: index === selected ? "active" : ""');
    expect(tabBarSource).toContain("this.setData(createTabState(ordersEnabled))");
  });

  test("coalesces concurrent app-config requests", () => {
    expect(apiSource).toContain("let inflightAppConfig = null");
    expect(apiSource).toContain("if (inflightAppConfig) return inflightAppConfig");
    expect(tabBarSource).toContain("const cfg = await getAppConfig()");
    expect(sportsPageSource).toContain("const config = await api.getAppConfig()");
  });

  test("uses chat-only mode for new users while preserving bound-account features", () => {
    expect(sportsPageSource).toContain("sportsEnabled: enabled");
    expect(sportsPageSource).toContain("accountFeaturesEnabled: this.data.sportsEnabled || isBound");
    expect(sportsPageSource).not.toContain('wx.switchTab({ url: "/pages/home/index" })');
    expect(sportsPageTemplate).toContain('wx:if="{{accountFeaturesEnabled}}" class="account-panel');
    expect(sportsPageTemplate).toContain('wx:if="{{accountFeaturesEnabled}}" class="goal-dashboard');
    expect(sportsPageTemplate).toContain('wx:if="{{virtualPaymentProducts.length}}"');
    expect(sportsPageTemplate).toContain('wx:if="{{membershipDialogVisible}}" class="membership-overlay"');
    expect(sportsPageTemplate).not.toContain("accountFeaturesEnabled && isBound && virtualPaymentProducts.length");
    expect(sportsPageTemplate).toContain("想聊点什么运动问题？");
  });
});
