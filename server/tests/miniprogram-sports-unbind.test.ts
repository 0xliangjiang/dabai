import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";

const source = readFileSync(resolve("../miniprogram/pages/sports/index.js"), "utf8");
function page(confirm = true, quota = 2) {
  let definition: any;
  const request = vi.fn(async (_url: string, _options?: any) => ({ isBound: false, account: null, accountId: "new-id", selfUnbindUsed: 2, selfUnbindRemaining: 1, selfUnbindLimit: 3, membershipExpiresAt: "9999-12-31T23:59:59.999Z" }));
  const api = { request, ensureLogin: vi.fn(async () => {}) };
  const wx = { showModal: vi.fn((options: any) => options.success?.({ confirm })), showToast: vi.fn() };
  runInNewContext(source, { Page: (p: any) => { definition = p; }, require: (name: string) => name.endsWith("/api") ? api : {}, wx, console });
  definition.data = { ...definition.data, isBound: true, accountId: "old-id", selfUnbindRemaining: quota, sportsHandoffReady: true, adStepGrantToken: "old-grant", qrcodeImage: "old-qr" };
  definition.setData = (data: any) => Object.assign(definition.data, data);
  definition.sportsHandoff = { ticket: "old-ticket" };
  return { definition, request, wx };
}

describe("mini-program self-unbind", () => {
  test.each([true, false])("chat confirmation uses the same unbind endpoint, confirm=%s", async confirm => {
    const { definition, request } = page(confirm);
    request.mockImplementation(async (url: string) => url === "/api/sports/chat"
      ? { action: "unbind_confirm", accountId: "old-id", selfUnbindLimit: 3, selfUnbindUsed: 1, selfUnbindRemaining: 2, reply: "请确认解绑" } as any
      : { isBound: false, account: null, accountId: "new-id", selfUnbindUsed: 2, selfUnbindRemaining: 1, selfUnbindLimit: 3 } as any);
    await definition.sendChatMessage("解绑账号");
    expect(request.mock.calls.filter(([url]) => url === "/api/sports/unbind")).toHaveLength(confirm ? 1 : 0);
    expect(definition.data.isBound).toBe(!confirm);
    expect(definition.data.selfUnbindRemaining).toBe(confirm ? 1 : 2);
    expect(definition.data.messages.at(-1).content).toContain(confirm ? "旧账号资料已删除" : "已取消解绑");
    expect(definition.data.chatLoading).toBe(false);
  });
  test("chat quota exhaustion shows contact guidance without opening a destructive confirmation", async () => {
    const { definition, request, wx } = page();
    request.mockResolvedValue({ action: "unbind_limit", selfUnbindLimit: 3, selfUnbindUsed: 3, selfUnbindRemaining: 0, reply: "请联系客服，由管理员解绑" } as any);
    await definition.sendChatMessage("解绑账号");
    expect(request).toHaveBeenCalledTimes(1);
    expect(wx.showModal).not.toHaveBeenCalled();
    expect(definition.data.messages.at(-1).action).toBe("unbind_limit");
    expect(definition.data).toMatchObject({ isBound: true, selfUnbindRemaining: 0 });
  });
  test("a changed account is refreshed instead of confirming deletion of an unseen new identity", async () => {
    const { definition, request, wx } = page();
    request.mockImplementation(async url => url === "/api/sports/chat"
      ? { action: "unbind_confirm", accountId: "changed-id", selfUnbindLimit: 3, selfUnbindUsed: 1, selfUnbindRemaining: 2, reply: "请确认解绑" } as any
      : { isBound: true, account: { email: "new***@gmail.com" }, accountId: "changed-id", selfUnbindLimit: 3, selfUnbindUsed: 1, selfUnbindRemaining: 2 } as any);
    await definition.sendChatMessage("解绑账号");
    expect(wx.showModal).not.toHaveBeenCalled();
    expect(request.mock.calls.some(([url]) => url === "/api/sports/unbind")).toBe(false);
    expect(definition.data.accountId).toBe("changed-id");
    expect(definition.data.messages.at(-1).content).toContain("账号状态已变化");
  });
  test("canceling confirmation does not call the endpoint or change remaining quota", async () => {
    const { definition, request } = page(false);
    await definition.handleUnbindTap();
    expect(request).not.toHaveBeenCalled();
    expect(definition.data).toMatchObject({ isBound: true, selfUnbindRemaining: 2, unbinding: false });
  });
  test("clears the old account, QR, handoff and ad grant after a confirmed unbind", async () => {
    const { definition, request } = page();
    await definition.handleUnbindTap();
    expect(request).toHaveBeenCalledWith("/api/sports/unbind", { method: "POST", data: { accountId: "old-id" } });
    expect(definition.data).toMatchObject({ isBound: false, account: null, qrcodeImage: "", sportsHandoffReady: false, adStepGrantToken: "", selfUnbindRemaining: 1, unbinding: false });
    expect(definition.sportsHandoff).toBeNull();
  });
  test("duplicate taps while confirmation is open cannot send duplicate mutations", async () => {
    const { definition, request, wx } = page();
    let callback: any;
    wx.showModal.mockImplementation((options: any) => { callback = options.success; });
    const pending = definition.handleUnbindTap();
    await definition.handleUnbindTap();
    expect(wx.showModal).toHaveBeenCalledTimes(1);
    callback({ confirm: true });
    await pending;
    expect(request).toHaveBeenCalledTimes(1);
  });
  test("an exhausted quota never sends a user unbind request and exposes customer service", async () => {
    const { definition, request, wx } = page(true, 0);
    await definition.handleUnbindTap();
    expect(request).not.toHaveBeenCalled();
    expect(wx.showModal.mock.calls[0][0].content).toContain("管理员解绑");
    const template = readFileSync(resolve("../miniprogram/pages/sports/index.wxml"), "utf8");
    expect(template).toContain('open-type="contact"');
    expect(template).toContain("联系管理员解绑");
  });
});
