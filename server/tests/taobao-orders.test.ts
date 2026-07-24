import { describe, expect, test } from "vitest";
import { createTaobaoOrderClient } from "../src/integrations/taobao/orders.js";

describe("Taobao order client", () => {
  test("keeps orders with an empty item_id so title attribution can run", async () => {
    const client = createTaobaoOrderClient(
      {
        apiUrl: "https://orders.example.test",
        appKey: "key",
        sid: "sid"
      },
      async () =>
        new Response(
          JSON.stringify({
            tbk_sc_order_details_get_response: {
              data: {
                has_next: false,
                results: {
                  publisher_order_dto: [
                    {
                      trade_id: "123456789012345678",
                      item_id: "",
                      item_title: "加密商品长标题",
                      tk_status: 12,
                      alipay_total_price: "9.90",
                      pub_share_pre_fee: "1.00",
                      tb_paid_time: "2026-07-24 10:00:00"
                    }
                  ]
                }
              }
            }
          }),
          { status: 200 }
        )
    );

    const result = await client.fetchTaobaoOrders({
      startTime: new Date("2026-07-24T01:00:00Z"),
      endTime: new Date("2026-07-24T03:00:00Z")
    });

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toMatchObject({
      tbkOrderId: "123456789012345678",
      itemId: "",
      itemTitle: "加密商品长标题"
    });
  });
});
