import { describe, expect, test, vi } from "vitest";
import {
  createTaobaoClient,
  DingdanxiaApiError,
  DingdanxiaClient,
  MockTaobaoClient
} from "../src/integrations/taobao/client.js";

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
      {
        apiKey: "ddx-key",
        apiUrl: "https://api.tbk.dingdanxia.com/tbk/wn_convert",
        pid: "mm_1_2_3"
      },
      { fetch: fetchMock }
    );

    await expect(client.convert("https://m.tb.cn/demo")).resolves.toEqual({
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
      {
        apiKey: "ddx-key",
        apiUrl: "https://api.tbk.dingdanxia.com/tbk/wn_convert",
        pid: "mm_1_2_3"
      },
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
