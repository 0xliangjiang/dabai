import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("mini program invite poster", () => {
  test("registers a dedicated poster page with three initialized templates", () => {
    const appConfig = JSON.parse(read("miniprogram/app.json")) as { pages: string[] };
    const { POSTER_TEMPLATES } = require(
      path.join(root, "miniprogram/utils/poster.js")
    ) as { POSTER_TEMPLATES: Array<{ id: string; colors: string[] }> };

    expect(appConfig.pages).toContain("pages/invite-poster/index");
    expect(POSTER_TEMPLATES.map((template) => template.id)).toEqual([
      "toolbox",
      "checklist",
      "recommend"
    ]);
    expect(POSTER_TEMPLATES.every((template) => template.colors.length === 3)).toBe(true);
  });

  test("downloads a personal code and supports save, sharing and permission recovery", () => {
    const script = read("miniprogram/pages/invite-poster/index.js");
    const template = read("miniprogram/pages/invite-poster/index.wxml");
    const inviteScript = read("miniprogram/pages/invite/index.js");

    expect(script).toContain('downloadFile("/api/users/me/invite-code")');
    expect(script).toContain("wx.canvasToTempFilePath");
    expect(script).toContain("wx.saveImageToPhotosAlbum");
    expect(script).toContain("wx.openSetting");
    expect(template).toContain('open-type="share"');
    expect(inviteScript).toContain('"/pages/invite-poster/index"');
  });

  test("captures an inviter from an unlimited-code scene", () => {
    const appScript = read("miniprogram/app.js");
    const inviteScript = read("miniprogram/pages/invite/index.js");

    expect(appScript).toContain("query.inviter || query.scene");
    expect(inviteScript).toContain("options.inviter || options.scene");
  });
});
