import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import path from "node:path";
const root = path.resolve("..", "sports-miniprogram");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
function harness() {
  const storage = new Map<string, any>();
  const wx = { getStorageSync: vi.fn((key: string) => storage.get(key)), setStorageSync: vi.fn((key: string, value: any) => storage.set(key, JSON.parse(JSON.stringify(value)))),
    showToast: vi.fn(), showModal: vi.fn(), navigateTo: vi.fn(), login: vi.fn(), request: vi.fn() };
  const app = { globalData: { pendingTicket: "", accountEntryRequested: false } };
  const requireModule = (file: string): any => {
    const module = { exports: {} };
    runInNewContext(read(file), { module, wx });
    return module.exports;
  };
  const page = (name: string) => {
    let definition: any;
    runInNewContext(read(`pages/${name}/index.js`), { Page: (value: any) => { definition = value; },
      require: (file: string) => requireModule(`utils/${file.split("/").pop()}.js`), wx, getApp: () => app });
    definition.setData = (data: any) => Object.assign(definition.data, data);
    return definition;
  };
  return { storage, wx, app, page, requireModule };
}
const event = (id: string) => ({ currentTarget: { dataset: { id } } });

describe("public toolbox", () => {
  test("landing, real goal records and calculations work without login or networking", () => {
    const h = harness(); h.page("toolbox").onShow();
    const goals = h.page("goals"); goals.onShow(); goals.data.goalInput = "阅读 20 分钟"; goals.submitGoal();
    const converter = h.page("converter"); converter.data.amount = "1"; converter.calculate();
    expect(converter.data.result).toBe("100 cm");
    const dates = h.page("dates"); dates.onLoad(); dates.calculate(); expect(dates.data.result).toBe("0 天");
    expect(h.wx.login).not.toHaveBeenCalled(); expect(h.wx.request).not.toHaveBeenCalled(); expect(h.wx.navigateTo).not.toHaveBeenCalled();
    const config = JSON.parse(read("app.json")); expect(config.pages[0]).toBe("pages/toolbox/index");
    expect(read("pages/toolbox/index.wxml")).toContain('/pages/home/index');
  });
  test("an incoming handoff still opens the original sports route once while navigating", () => {
    const h = harness(); h.app.globalData.pendingTicket = "a".repeat(64); h.app.globalData.accountEntryRequested = true;
    const page = h.page("toolbox"); page.onShow(); page.onShow();
    expect(h.wx.navigateTo).toHaveBeenCalledTimes(1); expect(h.wx.navigateTo.mock.calls[0][0].url).toBe("/pages/home/index?mode=account");
  });
  test("an old unconsumed ticket never redirects a normal toolbox visit to association", () => {
    const h = harness(); h.app.globalData.pendingTicket = "a".repeat(64);
    h.page("toolbox").onShow(); expect(h.wx.navigateTo).not.toHaveBeenCalled();
    expect(h.app.globalData.pendingTicket).toBe("a".repeat(64));
  });
  test("only a fresh handoff from the configured original app requests a real-service entry", () => {
    let app: any;
    runInNewContext(read("app.js"), { App: (value: any) => { app = value; }, require: () => ({ sourceAppId: "trusted-source" }) });
    app.onShow({ referrerInfo: { appId: "trusted-source", extraData: { ticket: "a".repeat(64) } } });
    expect(app.globalData).toMatchObject({ pendingTicket: "a".repeat(64), accountEntryRequested: true });
    app.onShow({ referrerInfo: { appId: "trusted-source", extraData: { ticket: "a".repeat(64) } } });
    expect(app.globalData.accountEntryRequested).toBe(false);
    app.onShow({}); expect(app.globalData).toMatchObject({ pendingTicket: "a".repeat(64), accountEntryRequested: false });
    app.onShow({ referrerInfo: { appId: "another-app", extraData: { ticket: "b".repeat(64) } } });
    expect(app.globalData).toMatchObject({ pendingTicket: "a".repeat(64), accountEntryRequested: false });
    app.onShow({ referrerInfo: { appId: "trusted-source", extraData: { ticket: "invalid-ticket" } } });
    expect(app.globalData.accountEntryRequested).toBe(false);
  });
  test("goals survive a new page instance, editing and completion", () => {
    const h = harness(); let page = h.page("goals"); page.onShow();
    page.data.goalInput = "  整理书架  "; page.submitGoal();
    const id = page.data.items[0].id; expect(page.data.items[0].title).toBe("整理书架");
    page.toggleGoal(event(id)); page.editGoal(event(id)); page.data.goalInput = "整理书架和书桌"; page.submitGoal();
    page = h.page("goals"); page.onShow();
    expect(page.data.completed).toBe(1); expect(page.data.items).toEqual([expect.objectContaining({ id, title: "整理书架和书桌", done: true })]);
  });
  test("goal deletion requires confirmation and persists", () => {
    const h = harness(); const page = h.page("goals"); page.onShow(); page.data.goalInput = "写周报"; page.submitGoal();
    const id = page.data.items[0].id;
    page.deleteGoal(event(id)); h.wx.showModal.mock.calls[0][0].success({ confirm: false });
    expect(page.data.items).toHaveLength(1);
    page.deleteGoal(event(id)); h.wx.showModal.mock.calls[1][0].success({ confirm: true });
    const reloaded = h.page("goals"); reloaded.onShow(); expect(reloaded.data.items).toHaveLength(0);
  });
  test.each(["", "   ", "长".repeat(81)])("invalid goals are not persisted: %s", input => {
    const h = harness(); const page = h.page("goals"); page.onShow(); page.data.goalInput = input; page.submitGoal();
    expect(h.storage.size).toBe(0); expect(page.data.error).toContain("1–80");
  });
  test("failed writes keep existing records, edit text and completion state intact", () => {
    const h = harness(); const page = h.page("goals"); page.onShow(); page.data.goalInput = "完成阅读"; page.submitGoal();
    const id = page.data.items[0].id; h.wx.setStorageSync.mockImplementation(() => { throw new Error("quota"); });
    page.toggleGoal(event(id)); expect(page.data.items[0].done).toBe(false); expect(page.data.error).toContain("未保存");
    page.editGoal(event(id)); page.data.goalInput = "读完第二章"; page.submitGoal();
    expect(page.data.items[0].title).toBe("完成阅读"); expect(page.data.goalInput).toBe("读完第二章");
    expect(h.page("goals").data.items).toEqual([]);
    const reloaded = h.page("goals"); reloaded.onShow(); expect(reloaded.data.items[0].title).toBe("完成阅读");
  });
  test("storage read failures can retry; corrupted records are never overwritten", () => {
    const h = harness(); const repo = h.requireModule("utils/goals.js");
    h.wx.getStorageSync.mockImplementationOnce(() => { throw new Error("read failed"); });
    const page = h.page("goals"); page.onShow(); expect(page.data.ready).toBe(false); page.loadGoals(); expect(page.data.ready).toBe(true);
    h.storage.set(repo.STORAGE_KEY, { version: 1, items: [{ id: "bad" }] }); page.loadGoals();
    expect(page.data.ready).toBe(false); page.data.goalInput = "不要覆盖"; page.submitGoal();
    expect(h.wx.setStorageSync).not.toHaveBeenCalled(); expect(page.data.error).toContain("未被覆盖");
  });
  test("the record limit rejects new goals but permits editing existing goals", () => {
    const h = harness(); const repo = h.requireModule("utils/goals.js");
    repo.writeGoals(Array.from({ length: 100 }, (_, i) => ({ id: String(i), title: `目标 ${i}`, done: false, createdAt: Date.now() })));
    const page = h.page("goals"); page.onShow(); page.data.goalInput = "第 101 项"; page.submitGoal(); expect(page.data.error).toContain("100");
    page.editGoal(event("0")); page.data.goalInput = "修改目标"; page.submitGoal(); expect(page.data.items[0].title).toBe("修改目标");
  });
  test.each([
    ["1", 0, 3, 0, "1000"], ["1", 0, 4, 1, "2.54"], ["1", 0, 5, 0, "0.3048"],
    ["1", 1, 3, 0, "0.45359237"], ["16", 1, 4, 3, "1"], ["0", 1, 0, 2, "0"], ["0.0000000001", 0, 2, 3, "1e-16"]
  ])("converts %s in group %s from %s to %s", (amount, group, from, to, expected) => {
    expect(harness().requireModule("utils/toolbox.js").convert(amount, group, from, to).output).toBe(expected);
  });
  test.each(["", "-1", "1,000", "NaN", "Infinity", "1e999", "1000000000001"])('rejects invalid amounts: %s', value => {
    expect(() => harness().requireModule("utils/toolbox.js").convert(value, 0, 0, 1)).toThrow();
  });
  test("unit changes clear stale results and swapping retains the amount", () => {
    const page = harness().page("converter"); page.data.amount = "2"; page.calculate();
    page.swapUnits(); expect(page.data).toMatchObject({ result: "", amount: "2", fromIndex: 1, toIndex: 0 });
    page.calculate(); expect(page.data.result).toBe("0.02 m");
    page.chooseGroup({ detail: { value: "1" } }); expect(page.data).toMatchObject({ result: "", fromIndex: 0, toIndex: 1 });
  });
  test("date math handles leap days, century rules, reverse ranges, year boundaries and calendar days", () => {
    const t = harness().requireModule("utils/toolbox.js");
    expect(t.dateDifference("2024-02-28", "2024-03-01")).toBe(2);
    expect(t.dateDifference("2026-03-07", "2026-03-09")).toBe(2);
    expect(t.dateDifference("2026-03-09", "2026-03-07")).toBe(-2);
    expect(t.addDays("2024-03-01", "-1")).toBe("2024-02-29");
    expect(t.addDays("2026-12-31", "1")).toBe("2027-01-01");
    expect(t.addDays("2000-02-28", "1")).toBe("2000-02-29");
    expect(t.addDays("1900-02-28", "1")).toBe("1900-03-01");
  });
  test.each(["2026-02-29", "1900-02-29", "2026-04-31", "2026-13-01", "2026-01-00", "1899-12-31", "2101-01-01", "2026-1-1"])("rejects invalid dates: %s", value => {
    const t = harness().requireModule("utils/toolbox.js"); expect(() => t.dateDifference(value, "2026-10-08")).toThrow();
  });
  test.each(["", "1.5", "36501", "1e2"])("rejects invalid day offsets: %s", value => {
    const t = harness().requireModule("utils/toolbox.js"); expect(() => t.addDays("2026-10-08", value)).toThrow();
  });
  test("date output cannot leave the supported range and edits clear old results", () => {
    const h = harness(); const t = h.requireModule("utils/toolbox.js");
    expect(() => t.addDays("2100-12-31", "1")).toThrow(); expect(() => t.addDays("1900-01-01", "-1")).toThrow();
    const page = h.page("dates"); page.onLoad(); page.chooseMode({ detail: { value: "1" } });
    page.data.start = "2026-10-08"; page.data.daysInput = "7"; page.calculate(); expect(page.data.result).toBe("2026-10-15");
    page.inputDays({ detail: { value: "-7" } }); expect(page.data.result).toBe(""); page.calculate(); expect(page.data.result).toBe("2026-10-01");
  });
});
