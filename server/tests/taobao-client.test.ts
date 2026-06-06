import { createHash } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import {
  createTaobaoClient,
  DingdanxiaClient,
  DingdanxiaApiError,
  MockTaobaoClient,
  signTopRequest,
  TaobaoApiError,
  TaobaoTopClient
} from "../src/integrations/taobao/client.js";

describe("signTopRequest", () => {
  test("builds uppercase TOP MD5 signatures from sorted params", () => {
    const params = {
      foo: "1",
      bar: "2",
      foo_bar: "3",
      foobar: "4"
    };
    const expected = createHash("md5")
      .update("secretbar2foo1foo_bar3foobar4secret", "utf8")
      .digest("hex")
      .toUpperCase();

    expect(signTopRequest(params, "secret")).toBe(expected);
  });

  test("ignores sign and empty values when signing", () => {
    const withoutIgnored = signTopRequest({ app_key: "app", method: "method" }, "secret");

    expect(
      signTopRequest(
        {
          app_key: "app",
          method: "method",
          sign: "SHOULD_NOT_BE_INCLUDED",
          optional: ""
        },
        "secret"
      )
    ).toBe(withoutIgnored);
  });
});

describe("TaobaoTopClient", () => {
  test("posts signed taobao.tbk.tpwd.convert requests and maps the response", async () => {
    const fetchMock = vi.fn(async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(init).toBeDefined();
      const requestInit = init!;
      const body = requestInit.body?.toString() ?? "";
      expect(requestInit.method).toBe("POST");
      expect(requestInit.headers).toEqual({
        "content-type": "application/x-www-form-urlencoded;charset=utf-8"
      });
      expect(body).toContain("method=taobao.tbk.tpwd.convert");
      expect(body).toContain("app_key=test-app-key");
      expect(body).toContain("adzone_id=123456");
      expect(body).toContain("password_content=%EF%BF%A5abc%EF%BF%A5");
      expect(body).toContain("sign=");

      return new Response(
        JSON.stringify({
          tbk_tpwd_convert_response: {
            data: {
              num_iid: "12312",
              click_url: "https://s.click.taobao.com/t?e=xxx",
              model: "￥short￥",
              password: "37￥ long password ￥ https://m.tb.cn/demo 商品标题",
              short_url: "https://s.click.taobao.com/vpIZmSu"
            }
          }
        }),
        { status: 200 }
      );
    });

    const client = new TaobaoTopClient(
      {
        appKey: "test-app-key",
        appSecret: "test-secret",
        adzoneId: "123456",
        apiUrl: "https://eco.taobao.com/router/rest"
      },
      {
        fetch: fetchMock,
        now: () => new Date("2026-06-06T00:00:00.000Z")
      }
    );

    await expect(client.convert("￥abc￥")).resolves.toEqual({
      itemId: "12312",
      itemTitle: "Taobao item 12312",
      itemImageUrl: "",
      itemPriceCents: 0,
      commissionRate: 0,
      generatedPassword: "37￥ long password ￥ https://m.tb.cn/demo 商品标题",
      generatedShortUrl: "https://s.click.taobao.com/vpIZmSu",
      generatedClickUrl: "https://s.click.taobao.com/t?e=xxx"
    });
  });

  test("throws a TaobaoApiError when TOP returns error_response", async () => {
    const client = new TaobaoTopClient(
      {
        appKey: "test-app-key",
        appSecret: "test-secret",
        adzoneId: "123456",
        apiUrl: "https://eco.taobao.com/router/rest"
      },
      {
        fetch: async () =>
          new Response(
            JSON.stringify({
              error_response: {
                code: 50,
                msg: "Remote service error",
                sub_code: "isv.invalid-parameter",
                sub_msg: "非法参数"
              }
            }),
            { status: 200 }
          ),
        now: () => new Date("2026-06-06T00:00:00.000Z")
      }
    );

    await expect(client.convert("bad")).rejects.toThrow(TaobaoApiError);
  });
});

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
  test("uses the real TOP client when Taobao credentials and adzone are configured", () => {
    const client = createTaobaoClient({
      taobaoAppKey: "app-key",
      taobaoAppSecret: "app-secret",
      taobaoApiUrl: "https://eco.taobao.com/router/rest",
      adzoneId: "123456"
    });

    expect(client).toBeInstanceOf(TaobaoTopClient);
  });

  test("keeps using the mock client when env placeholders have not been replaced", () => {
    const client = createTaobaoClient({
      taobaoAppKey: "replace-with-taobao-app-key",
      taobaoAppSecret: "replace-with-taobao-app-secret",
      taobaoApiUrl: "https://eco.taobao.com/router/rest",
      adzoneId: "replace-with-adzone-id"
    });

    expect(client).toBeInstanceOf(MockTaobaoClient);
  });

  test("uses Dingdanxia when selected and apikey is configured", () => {
    const client = createTaobaoClient({
      provider: "dingdanxia",
      dingdanxiaApiKey: "ddx-key",
      dingdanxiaApiUrl: "https://api.tbk.dingdanxia.com/tbk/wn_convert",
      dingdanxiaPid: "mm_1_2_3",
      taobaoAppKey: "",
      taobaoAppSecret: "",
      taobaoApiUrl: "https://eco.taobao.com/router/rest",
      adzoneId: "mock-adzone"
    });

    expect(client).toBeInstanceOf(DingdanxiaClient);
  });
});
