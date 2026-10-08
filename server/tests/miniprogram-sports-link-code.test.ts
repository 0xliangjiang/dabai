import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";

const source = readFileSync(resolve("../miniprogram/pages/sports/index.js"), "utf8");
function page() {
  let definition: any;
  const request = vi.fn(async () => ({ bindingCode: "ABCDEFGHJKLM", expiresAt: new Date(Date.now() + 300_000).toISOString() }));
  const clipboard = vi.fn();
  runInNewContext(source, { Page: (value: any) => { definition = value; }, require: (name: string) => name.endsWith("/api") ? { request, ensureLogin: async () => {} } : {}, wx: { setClipboardData: clipboard }, console });
  definition.data = { ...definition.data, isBound: true, accountId: "original-account", sportsHandoffReady: true };
  definition.setData = (data: any) => Object.assign(definition.data, data);
  definition.sportsHandoff = { ticket: "old-ticket" };
  return { definition, request, clipboard };
}

describe("source mini-program link code", () => {
  test("shows and copies the code, clears revoked handoffs and blocks duplicate generation", async () => {
    const { definition, request, clipboard } = page();
    const pending = definition.generateSportsLinkCode(); await definition.generateSportsLinkCode(); await pending;
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/api/sports-app/link-code", { method: "POST" });
    expect(definition.data).toMatchObject({ sportsLinkDialogVisible: true, sportsLinkCode: "ABCD-EFGH-JKLM", sportsHandoffReady: false, sportsLinkCodeLoading: false });
    expect(definition.sportsHandoff).toBeNull();
    definition.copySportsLinkCode(); expect(clipboard).toHaveBeenCalledWith(expect.objectContaining({ data: "ABCD-EFGH-JKLM" }));
    definition.data.sportsLinkCodeExpiresAt = new Date(0).toISOString(); definition.copySportsLinkCode();
    expect(clipboard).toHaveBeenCalledTimes(1); expect(definition.data.sportsLinkCode).toBe("");
    expect(definition.data.sportsLinkCodeError).toContain("已过期");
  });
  test("discards a generated code if the source account changed during the request", async () => {
    const { definition, request } = page();
    request.mockImplementation(async () => {
      definition.data.accountId = "replacement-account";
      return { bindingCode: "ABCDEFGHJKLM", expiresAt: new Date(Date.now() + 300_000).toISOString() };
    });
    await definition.generateSportsLinkCode();
    expect(definition.data.sportsLinkCode).toBe(""); expect(definition.data.sportsLinkCodeError).toContain("账号状态已变化");
  });
  test("unbind or refreshed account identity removes the displayed code", async () => {
    const { definition } = page();
    await definition.generateSportsLinkCode();
    definition.applyAccount({ accountId: "replacement-account", isBound: false });
    expect(definition.data).toMatchObject({ sportsLinkCode: "", sportsLinkDialogVisible: false, sportsHandoffReady: false });
  });
});
