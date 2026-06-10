import { describe, expect, test } from "vitest";
import {
  ConversionApiError,
  MockTaobaoClient,
  UnsupportedPlatformError,
  ZhetaokeClient,
  createTaobaoClient
} from "../src/integrations/taobao/client.js";
import type { JdUnionClient } from "../src/integrations/jd/union.js";

const ZTK_CONFIG = {
  apiUrl: "https://api.zhetaoke.com:10001/api/open_gaoyongzhuanlian_tkl.ashx",
  appKey: "ztk-key",
  sid: "12345",
  pid: "mm_1_2_3",
  jdApiUrl: "https://api.zhetaoke.com:10001/api/open_jing_union_open_promotion_byunionid_get.ashx",
  jdUnionId: "",
  jdPositionId: ""
};

function ztkResponse(content: unknown, status = 200) {
  return new Response(JSON.stringify({ status, content }), { status: 200 });
}

describe("ZhetaokeClient", () => {
  test("converts taobao content via zhetaoke universal API", async () => {
    let captured: URLSearchParams | undefined;
    const client = new ZhetaokeClient(ZTK_CONFIG, {
      fetch: (async (_url: unknown, init: RequestInit) => {
        captured = new URLSearchParams(init.body as string);
        return ztkResponse([
          {
            tao_id: "660000001",
            title: "测试商品",
            pict_url: "https://img.alicdn.com/x.jpg",
            quanhou_jiage: "59.90",
            max_commission_rate: "15.5",
            coupon_click_url: "https://uland.taobao.com/abc",
            shorturl: "https://s.click.taobao.com/x",
            tkl: "￥newpass￥"
          }
        ]);
      }) as typeof fetch
    });

    const result = await client.convert("￥oldpass￥ 好物推荐");
    expect(captured?.get("appkey")).toBe("ztk-key");
    expect(captured?.get("sid")).toBe("12345");
    expect(captured?.get("pid")).toBe("mm_1_2_3");
    expect(captured?.get("tkl")).toContain("￥oldpass￥");
    expect(result).toMatchObject({
      platform: "taobao",
      itemId: "660000001",
      itemTitle: "测试商品",
      itemPriceCents: 5990,
      commissionRate: 0.155,
      estimatedCommissionCents: Math.round(5990 * 0.155),
      generatedPassword: "￥newpass￥",
      generatedShortUrl: "https://s.click.taobao.com/x",
      generatedClickUrl: "https://uland.taobao.com/abc"
    });
  });

  test("surfaces zhetaoke business errors", async () => {
    const client = new ZhetaokeClient(ZTK_CONFIG, {
      fetch: (async () =>
        new Response(JSON.stringify({ status: 5004, content: "该商品无推广计划" }), { status: 200 })) as typeof fetch
    });

    await expect(client.convert("https://item.taobao.com/item.htm?id=1")).rejects.toThrow(ConversionApiError);
  });

  test("routes JD content to the union client", async () => {
    const jdUnion: JdUnionClient = {
      async promotionGet(materialId) {
        expect(materialId).toBe("https://item.jd.com/100012043978.html");
        return { clickUrl: "https://u.jd.com/click", shortUrl: "https://u.jd.com/s" };
      },
      async goodsQueryBySku(skuId) {
        expect(skuId).toBe("100012043978");
        return {
          skuName: "京东测试商品",
          imageInfo: { imageList: [{ url: "https://img.jd.com/1.jpg" }] },
          priceInfo: { lowestCouponPrice: 199.0 },
          commissionInfo: { commissionShare: 8, couponCommission: 15.92 }
        };
      },
      async orderRowQuery() {
        return { rows: [], hasMore: false };
      }
    };

    const client = new ZhetaokeClient(ZTK_CONFIG, { jdUnion });
    const result = await client.convert("看看这个 https://item.jd.com/100012043978.html");
    expect(result).toMatchObject({
      platform: "jd",
      itemId: "100012043978",
      itemTitle: "京东测试商品",
      itemImageUrl: "https://img.jd.com/1.jpg",
      itemPriceCents: 19900,
      estimatedCommissionCents: 1592,
      generatedClickUrl: "https://u.jd.com/click"
    });
  });

  test("JD content without union config gets a friendly error", async () => {
    const client = new ZhetaokeClient(ZTK_CONFIG, {});
    await expect(client.convert("https://item.jd.com/1.html")).rejects.toThrow(UnsupportedPlatformError);
  });

  test("pdd and vip are reported as not yet supported", async () => {
    const client = new ZhetaokeClient(ZTK_CONFIG, {});
    await expect(client.convert("https://mobile.yangkeduo.com/goods.html?id=1")).rejects.toThrow(
      UnsupportedPlatformError
    );
    await expect(client.convert("https://www.vip.com/product-1.html")).rejects.toThrow(UnsupportedPlatformError);
  });

  test("JD goes through zhetaoke when jdUnionId configured", async () => {
    let captured: URLSearchParams | undefined;
    const client = new ZhetaokeClient(
      { ...ZTK_CONFIG, jdUnionId: "1001513077", jdPositionId: "9001" },
      {
        fetch: (async (url: unknown, init: RequestInit) => {
          if (String(url).includes("open_jing_union")) {
            captured = new URLSearchParams(init.body as string);
            return new Response(
              JSON.stringify({
                status: 200,
                content: { data: { shortURL: "https://u.jd.com/ztk", clickURL: "https://union-click.jd.com/ztk" } }
              }),
              { status: 200 }
            );
          }
          return new Response("{}", { status: 200 });
        }) as typeof fetch
      }
    );

    const result = await client.convert("https://item.jd.com/100012043978.html");
    expect(captured?.get("unionId")).toBe("1001513077");
    expect(captured?.get("positionId")).toBe("9001");
    expect(captured?.get("chainType")).toBe("2");
    expect(result).toMatchObject({
      platform: "jd",
      itemId: "100012043978",
      generatedShortUrl: "https://u.jd.com/ztk",
      generatedClickUrl: "https://union-click.jd.com/ztk"
    });
  });

  test("factory falls back to mock without zhetaoke key", () => {
    expect(createTaobaoClient({})).toBeInstanceOf(MockTaobaoClient);
    expect(createTaobaoClient({ zhetaokeAppKey: "replace-with-key" })).toBeInstanceOf(MockTaobaoClient);
    expect(createTaobaoClient({ zhetaokeAppKey: "real-key", zhetaokeSid: "1", zhetaokePid: "p" })).toBeInstanceOf(
      ZhetaokeClient
    );
  });
});
