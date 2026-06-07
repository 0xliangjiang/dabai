import { describe, expect, test, vi } from "vitest";
import {
  createTaobaoClient,
  DingdanxiaApiError,
  DingdanxiaClient,
  MockTaobaoClient
} from "../src/integrations/taobao/client.js";

const baseDingdanxiaConfig = {
  apiKey: "ddx-key",
  apiUrl: "https://api.tbk.dingdanxia.com/tbk/wn_convert",
  pid: "mm_1_2_3",
  jdApiUrl: "https://api.tbk.dingdanxia.com/jd/promotion_common",
  jdSiteId: "jd-site",
  jdUnionId: "jd-union",
  jdAuthKey: "jd-auth-key",
  jdSceneId: "jd-scene",
  jdPositionId: "jd-position",
  jdPid: "jd-pid",
  pddApiUrl: "https://api.tbk.dingdanxia.com/pdd/url_convert",
  pddPid: "pdd-pid",
  pddCustomParameters: "{\"uid\":\"default\"}",
  vipApiUrl: "https://api.tbk.dingdanxia.com/vip/url_privilege",
  vipChanTag: "vip-tag",
  vipStatParam: "vip-stat"
};

describe("DingdanxiaClient", () => {
  test("posts tbk_wn_convert requests and maps the response", async () => {
    const fetchMock = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(url).toBe("https://api.tbk.dingdanxia.com/tbk/wn_convert");
      expect(init).toBeDefined();
      const requestInit = init!;
      const body = requestInit.body?.toString() ?? "";
      expect(requestInit.method).toBe("POST");
      expect(requestInit.headers).toEqual({
        "content-type": "application/x-www-form-urlencoded;charset=utf-8"
      });
      expect(body).toContain("apikey=ddx-key");
      expect(body).toContain("content=https%3A%2F%2Fm.tb.cn%2Fdemo");
      expect(body).toContain("pid=mm_1_2_3");

      return new Response(
        JSON.stringify({
          code: 200,
          msg: "请求成功",
          data: {
            item_id: 575588057285,
            item_url: "https://s.click.taobao.com/t?e=xxx",
            item_tpwd: "￥dtnTcW4lw5e￥",
            long_item_tpwd: "0.0fu置内容￥dtnTcW4lw5e￥转移至淘tao寳",
            max_commission_rate: "2.40",
            itemInfo: {
              title: "示例商品",
              pict_url: "https://img.alicdn.com/demo.jpg",
              zk_final_price: 139
            }
          }
        }),
        { status: 200 }
      );
    });

    const client = new DingdanxiaClient(
      baseDingdanxiaConfig,
      { fetch: fetchMock }
    );

    await expect(client.convert("https://m.tb.cn/demo")).resolves.toEqual({
      platform: "taobao",
      itemId: "575588057285",
      itemTitle: "示例商品",
      itemImageUrl: "https://img.alicdn.com/demo.jpg",
      itemPriceCents: 13900,
      commissionRate: 0.024,
      generatedPassword: "0.0fu置内容￥dtnTcW4lw5e￥转移至淘tao寳",
      generatedShortUrl: "",
      generatedClickUrl: "https://s.click.taobao.com/t?e=xxx"
    });
  });

  test("throws a DingdanxiaApiError when the response code is not 200", async () => {
    const client = new DingdanxiaClient(
      baseDingdanxiaConfig,
      {
        fetch: async () =>
          new Response(
            JSON.stringify({
              code: 4014,
              msg: "PID异常"
            }),
            { status: 200 }
          )
      }
    );

    await expect(client.convert("bad")).rejects.toThrow(DingdanxiaApiError);
  });

  test("posts JD promotion_common requests and maps the response", async () => {
    const fetchMock = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(url).toBe("https://api.tbk.dingdanxia.com/jd/promotion_common");
      const body = init?.body?.toString() ?? "";
      expect(body).toContain("apikey=ddx-key");
      expect(body).toContain("materialId=https%3A%2F%2Fitem.jd.com%2F100.html");
      expect(body).toContain("siteId=jd-site");
      expect(body).toContain("unionId=jd-union");
      expect(body).toContain("key=jd-auth-key");
      expect(body).toContain("sceneId=jd-scene");
      expect(body).toContain("positionId=jd-position");
      expect(body).toContain("pid=jd-pid");

      return new Response(
        JSON.stringify({
          code: 200,
          data: {
            skuId: "100",
            skuName: "京东商品",
            clickURL: "https://u.jd.com/demo",
            imageUrl: "https://img.jd.com/demo.jpg",
            price: 199,
            commissionRate: 8
          }
        }),
        { status: 200 }
      );
    });

    const client = new DingdanxiaClient(baseDingdanxiaConfig, { fetch: fetchMock });

    await expect(client.convert("https://item.jd.com/100.html")).resolves.toEqual({
      platform: "jd",
      itemId: "100",
      itemTitle: "京东商品",
      itemImageUrl: "https://img.jd.com/demo.jpg",
      itemPriceCents: 19900,
      commissionRate: 0.08,
      generatedPassword: "",
      generatedShortUrl: "https://u.jd.com/demo",
      generatedClickUrl: "https://u.jd.com/demo"
    });
  });

  test("posts PDD url_convert requests and maps the response", async () => {
    const fetchMock = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(url).toBe("https://api.tbk.dingdanxia.com/pdd/url_convert");
      const body = init?.body?.toString() ?? "";
      expect(body).toContain("apikey=ddx-key");
      expect(body).toContain("source_url=https%3A%2F%2Fmobile.yangkeduo.com%2Fgoods.html%3Fgoods_id%3D200");
      expect(body).toContain("pid=pdd-pid");
      expect(body).toContain("custom_parameters=%7B%22uid%22%3A%22default%22%7D");
      expect(body).toContain("itemInfo=true");

      return new Response(
        JSON.stringify({
          code: 200,
          data: {
            goods_id: "200",
            goods_name: "拼多多商品",
            goods_thumbnail_url: "https://img.pdd.com/demo.jpg",
            short_url: "https://p.pinduoduo.com/demo",
            mobile_url: "https://mobile.yangkeduo.com/promo",
            itemInfo: {
              goods_id: "200",
              goods_name: "拼多多商品",
              goods_thumbnail_url: "https://img.pdd.com/demo.jpg",
              min_group_price: 3990,
              promotion_rate: 120
            }
          }
        }),
        { status: 200 }
      );
    });

    const client = new DingdanxiaClient(baseDingdanxiaConfig, { fetch: fetchMock });

    await expect(client.convert("https://mobile.yangkeduo.com/goods.html?goods_id=200")).resolves.toEqual({
      platform: "pdd",
      itemId: "200",
      itemTitle: "拼多多商品",
      itemImageUrl: "https://img.pdd.com/demo.jpg",
      itemPriceCents: 3990,
      commissionRate: 0.12,
      generatedPassword: "",
      generatedShortUrl: "https://p.pinduoduo.com/demo",
      generatedClickUrl: "https://mobile.yangkeduo.com/promo"
    });
  });

  test("posts VIP url_privilege requests and maps the response", async () => {
    const fetchMock = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(url).toBe("https://api.tbk.dingdanxia.com/vip/url_privilege");
      const body = init?.body?.toString() ?? "";
      expect(body).toContain("apikey=ddx-key");
      expect(body).toContain("url=https%3A%2F%2Fm.vip.com%2Fproduct-300.html");
      expect(body).toContain("itemInfo=true");
      expect(body).toContain("chanTag=vip-tag");
      expect(body).toContain("statParam=vip-stat");

      return new Response(
        JSON.stringify({
          code: 200,
          data: {
            url: "https://t.vip.com/demo",
            shortUrl: "https://t.vip.com/s",
            commissionRate: 6,
            itemInfo: {
              goodsId: "300",
              goodsName: "唯品会商品",
              goodsThumbUrl: "https://img.vip.com/demo.jpg",
              vipPrice: 89
            }
          }
        }),
        { status: 200 }
      );
    });

    const client = new DingdanxiaClient(baseDingdanxiaConfig, { fetch: fetchMock });

    await expect(client.convert("https://m.vip.com/product-300.html")).resolves.toEqual({
      platform: "vip",
      itemId: "300",
      itemTitle: "唯品会商品",
      itemImageUrl: "https://img.vip.com/demo.jpg",
      itemPriceCents: 8900,
      commissionRate: 0.06,
      generatedPassword: "",
      generatedShortUrl: "https://t.vip.com/s",
      generatedClickUrl: "https://t.vip.com/demo"
    });
  });
});

describe("createTaobaoClient", () => {
  test("uses Dingdanxia when apikey is configured", () => {
    const client = createTaobaoClient({
      dingdanxiaApiKey: "ddx-key",
      dingdanxiaApiUrl: "https://api.tbk.dingdanxia.com/tbk/wn_convert",
      dingdanxiaPid: "mm_1_2_3"
    });

    expect(client).toBeInstanceOf(DingdanxiaClient);
  });

  test("keeps using the mock client when Dingdanxia apikey is missing", () => {
    const client = createTaobaoClient({
      dingdanxiaApiKey: "",
      dingdanxiaApiUrl: "https://api.tbk.dingdanxia.com/tbk/wn_convert",
      dingdanxiaPid: "mm_1_2_3"
    });

    expect(client).toBeInstanceOf(MockTaobaoClient);
  });

  test("keeps using the mock client when env placeholders have not been replaced", () => {
    const client = createTaobaoClient({
      dingdanxiaApiKey: "replace-with-dingdanxia-api-key",
      dingdanxiaApiUrl: "https://api.tbk.dingdanxia.com/tbk/wn_convert",
      dingdanxiaPid: "replace-with-your-taobao-pid"
    });

    expect(client).toBeInstanceOf(MockTaobaoClient);
  });
});
