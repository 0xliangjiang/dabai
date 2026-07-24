import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("mini program article experience", () => {
  test("registers the article detail page and exposes the tutorial switch", () => {
    const appConfig = JSON.parse(read("miniprogram/app.json")) as { pages: string[] };
    expect(appConfig.pages).toContain("pages/article-detail/index");

    const listTemplate = read("miniprogram/pages/deals/index.wxml");
    expect(listTemplate).toContain("优惠线报");
    expect(listTemplate).toContain("实用教程");
    expect(listTemplate).toContain("bindtap=\"openArticle\"");
    expect(listTemplate).toContain("data-kind=\"article\"");
  });

  test("article detail renders every supported content block", () => {
    const template = read("miniprogram/pages/article-detail/index.wxml");
    for (const type of ["paragraph", "heading", "image", "quote", "list", "callout", "divider"]) {
      expect(template).toContain(`item.type === '${type}'`);
    }
    expect(template).toContain("bindtap=\"previewImage\"");
    expect(template).not.toContain("<article");
  });

  test("article detail sharing carries the article and inviter", () => {
    const script = read("miniprogram/pages/article-detail/index.js");
    expect(script).toContain("/pages/article-detail/index?id=");
    expect(script).toContain("inviterSuffix(getCurrentUser(), true)");
    expect(script).toContain("onShareTimeline()");
    expect(script).toContain("/api/articles/");
  });
});
