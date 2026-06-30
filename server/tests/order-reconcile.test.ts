import { beforeEach, describe, expect, test } from "vitest";
import { createRepositories } from "../src/repositories/memory.js";
import { processOrder, reconcileOrderLedger, runOrderSync } from "../src/domain/order-sync.js";
import type { JdOrderClient } from "../src/integrations/jd/orders.js";
import type { TaobaoProductClient } from "../src/integrations/taobao/client.js";
import type { TaobaoOrderClient } from "../src/integrations/taobao/orders.js";
import type { Repositories, UpsertOrderInput } from "../src/repositories/types.js";

const OPTIONS = { commissionSharingRatio: 0.5, referralEnabled: false, referralRatio: 0 };

function orderInput(overrides: Partial<UpsertOrderInput> = {}): UpsertOrderInput {
  return {
    tbkOrderId: "T1",
    itemId: "item-1",
    itemTitle: "测试商品",
    payTime: new Date("2026-06-01T00:00:00Z"),
    payAmountCents: 10000,
    estimatedCommissionCents: 1000,
    settledCommissionCents: 800,
    orderStatus: "paid",
    rawPayload: {},
    ...overrides
  };
}

async function seedAttributedOrder(repos: Repositories, status: string) {
  const order = await repos.orders.upsert(orderInput({ orderStatus: status }));
  await repos.orders.upsertAttribution({
    tbkOrderId: order.tbkOrderId,
    status: "auto_matched",
    confidence: 1,
    reason: "single_candidate_inside_window",
    userId: "u1"
  });
  return order;
}

describe("reconcileOrderLedger", () => {
  let repos: Repositories;
  beforeEach(() => {
    repos = createRepositories();
  });

  test("已付款订单核对 → 台账 pending、返利按预估比例", async () => {
    const order = await seedAttributedOrder(repos, "paid");
    const result = await reconcileOrderLedger(repos, order, OPTIONS);
    expect(result).toEqual({ credited: true, rebateStatus: "pending" });

    const [summary] = await repos.orders.listByUser("u1");
    expect(summary.rebateStatus).toBe("pending");
    expect(summary.userRebateCents).toBe(500); // 1000 * 0.5
  });

  test("结算后重算 → pending 翻成 available，且不与残留 estimated 行重复计", async () => {
    const order = await seedAttributedOrder(repos, "paid");
    await reconcileOrderLedger(repos, order, OPTIONS); // 先有 estimated/pending 行

    const settled = await repos.orders.upsert(orderInput({ orderStatus: "settled" }));
    const result = await reconcileOrderLedger(repos, settled, OPTIONS);
    expect(result).toEqual({ credited: true, rebateStatus: "available" });

    const [summary] = await repos.orders.listByUser("u1");
    expect(summary.rebateStatus).toBe("available");
    expect(summary.userRebateCents).toBe(400); // 800 * 0.5，不是 500+400
    const balance = await repos.withdrawals.getAvailableBalance("u1");
    expect(balance).toBe(400);
  });

  test("重复核对幂等 → 金额不翻倍", async () => {
    const settled = await seedAttributedOrder(repos, "settled");
    await reconcileOrderLedger(repos, settled, OPTIONS);
    await reconcileOrderLedger(repos, settled, OPTIONS);
    await reconcileOrderLedger(repos, settled, OPTIONS);
    const balance = await repos.withdrawals.getAvailableBalance("u1");
    expect(balance).toBe(400);
  });

  test("退款 → 台账冲销、返利归零", async () => {
    const order = await seedAttributedOrder(repos, "settled");
    await reconcileOrderLedger(repos, order, OPTIONS);
    const refunded = await repos.orders.upsert(orderInput({ orderStatus: "refunded" }));
    const result = await reconcileOrderLedger(repos, refunded, OPTIONS);
    expect(result.rebateStatus).toBe("reversed");

    const [summary] = await repos.orders.listByUser("u1");
    expect(summary.rebateStatus).toBe("reversed");
    expect(summary.userRebateCents).toBe(0);
    expect(await repos.withdrawals.getAvailableBalance("u1")).toBe(0);
  });

  test("未确认归因（pending_review）不入账", async () => {
    const order = await repos.orders.upsert(orderInput({ orderStatus: "settled" }));
    await repos.orders.upsertAttribution({
      tbkOrderId: order.tbkOrderId,
      status: "pending_review",
      confidence: 0.5,
      reason: "multiple_candidates_inside_window",
      userId: "u1"
    });
    const result = await reconcileOrderLedger(repos, order, OPTIONS);
    expect(result).toEqual({ credited: false, rebateStatus: "none" });
    expect(await repos.withdrawals.getAvailableBalance("u1")).toBe(0);
  });

  test("二级提成跟随结算到上线", async () => {
    // 下线绑定上线（建号时写 inviterId），结算后提成应到上线账上
    const inviter = await repos.users.findOrCreateByOpenid("inviter");
    const downline = await repos.users.findOrCreateByOpenid("downline", { inviterId: inviter.id });

    const order = await repos.orders.upsert(orderInput({ orderStatus: "settled" }));
    await repos.orders.upsertAttribution({
      tbkOrderId: order.tbkOrderId,
      status: "auto_matched",
      confidence: 1,
      reason: "single_candidate_inside_window",
      userId: downline.id
    });
    await reconcileOrderLedger(repos, order, { commissionSharingRatio: 0.5, referralEnabled: true, referralRatio: 0.2 });

    // 下线到手 400（800*0.5），上线提成 80（400*0.2）
    expect(await repos.withdrawals.getAvailableBalance(downline.id)).toBe(400);
    expect(await repos.withdrawals.getAvailableBalance(inviter.id)).toBe(80);
  });
});

describe("commissionLedger.listStalePending", () => {
  let repos: Repositories;
  beforeEach(() => {
    repos = createRepositories();
  });

  test("找出已结算但台账仍 pending 的订单；已到账的不再上榜（收敛）", async () => {
    // 订单 A：结算但只手动制造了 pending（模拟滞后）
    const a = await seedAttributedOrder(repos, "paid");
    await reconcileOrderLedger(repos, a, OPTIONS); // pending 行
    await repos.orders.upsert(orderInput({ orderStatus: "settled" })); // 订单转结算，但未重算台账

    let stale = await repos.commissionLedger.listStalePending(100);
    expect(stale.map((o) => o.tbkOrderId)).toContain("T1");

    // 重算后应到账，且不再被判为 stale
    const settled = (await repos.orders.findById(a.id))!;
    await reconcileOrderLedger(repos, settled, OPTIONS);
    stale = await repos.commissionLedger.listStalePending(100);
    expect(stale).toHaveLength(0);
  });
});

describe("刷新返利：已结算但归因待复核 → 重跑归因后入账", () => {
  test("processOrder 重跑：已结算订单从待复核归到本人并到账", async () => {
    const repos = createRepositories();
    const user = await repos.users.findOrCreateByOpenid("u-recheck");
    // 订单已结算，itemId=IID9，付款时间在转化之后的窗内
    const order = await repos.orders.upsert(
      orderInput({ tbkOrderId: "RC1", orderStatus: "settled", itemId: "IID9", settledCommissionCents: 800, payTime: new Date(Date.now() + 60_000) })
    );
    // 该用户对此商品有一条转化（itemId 一致），但订单当前归因被卡在「待复核」
    await repos.conversions.create({
      userId: user.id,
      rawContent: "x",
      platform: "taobao",
      itemId: "IID9",
      itemTitle: "商品X",
      itemImageUrl: "",
      itemPriceCents: 0,
      commissionRate: 0,
      estimatedCommissionCents: 1000,
      estimatedRebateCents: 500,
      generatedPassword: "",
      generatedShortUrl: "",
      generatedClickUrl: ""
    });
    await repos.orders.upsertAttribution({
      tbkOrderId: order.tbkOrderId,
      status: "pending_review",
      confidence: 0.5,
      reason: "candidate_outside_window",
      userId: user.id
    });

    // 只重算台账不会入账（待复核被拦）
    await reconcileOrderLedger(repos, order, { commissionSharingRatio: 0.5 });
    expect(await repos.withdrawals.getAvailableBalance(user.id)).toBe(0);

    // 刷新返利走完整 processOrder：重跑归因→auto_matched→按已结算入账
    await processOrder(repos, order, { commissionSharingRatio: 0.5 });
    const attr = await repos.orders.getAttribution("RC1");
    expect(attr?.status).toBe("auto_matched");
    expect(await repos.withdrawals.getAvailableBalance(user.id)).toBe(400); // 800*0.5
  });
});

describe("已收货自动结算（小额即结/大额延迟）", () => {
  const AUTO = { commissionSharingRatio: 0.5, autoSettleThresholdCents: 2000, autoSettleDelayDays: 7 };
  async function seedReceived(repos: Repositories, commissionCents: number, receivedAt?: Date) {
    const user = await repos.users.findOrCreateByOpenid("u-recv");
    const order = await repos.orders.upsert(
      orderInput({ orderStatus: "received", estimatedCommissionCents: commissionCents, settledCommissionCents: null })
    );
    await repos.orders.upsertAttribution({
      tbkOrderId: order.tbkOrderId,
      status: "auto_matched",
      confidence: 1,
      reason: "single_candidate_inside_window",
      userId: user.id
    });
    return { user, order: receivedAt ? { ...order, receivedAt } : order };
  }

  test("已收货 + 小额佣金(≤20元) → 立即自动结算到账", async () => {
    const repos = createRepositories();
    const { user, order } = await seedReceived(repos, 1500); // 15 元
    const r = await reconcileOrderLedger(repos, order, AUTO);
    expect(r.rebateStatus).toBe("available");
    expect(await repos.withdrawals.getAvailableBalance(user.id)).toBe(750); // 1500*0.5
  });

  test("已收货 + 大额佣金(>20元) 未满7天 → 维持待结算（按订单佣金判，非返利）", async () => {
    const repos = createRepositories();
    // 佣金 30 元(>20) 但用户返利仅 15 元(<20)：仍应延迟，证明阈值看的是订单佣金
    const { user, order } = await seedReceived(repos, 3000);
    const r = await reconcileOrderLedger(repos, order, AUTO);
    expect(r.rebateStatus).toBe("pending");
    expect(await repos.withdrawals.getAvailableBalance(user.id)).toBe(0);
  });

  test("已收货 + 大额佣金 满7天 → 自动结算到账", async () => {
    const repos = createRepositories();
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const { user, order } = await seedReceived(repos, 3000, eightDaysAgo);
    const r = await reconcileOrderLedger(repos, order, AUTO);
    expect(r.rebateStatus).toBe("available");
    expect(await repos.withdrawals.getAvailableBalance(user.id)).toBe(1500); // 3000*0.5
  });
});

describe("批量核对（后台一键）", () => {
  test("把多笔已结算但台账 pending 的订单全部修复并收敛", async () => {
    const repos = createRepositories();
    // 造 3 笔：先 paid 入 pending 台账，再转 settled 但不重算
    for (let i = 0; i < 3; i++) {
      const tbkOrderId = `B${i}`;
      const order = await repos.orders.upsert(orderInput({ tbkOrderId, orderStatus: "paid" }));
      await repos.orders.upsertAttribution({
        tbkOrderId,
        status: "auto_matched",
        confidence: 1,
        reason: "single_candidate_inside_window",
        userId: `u${i}`
      });
      await reconcileOrderLedger(repos, order, OPTIONS);
      await repos.orders.upsert(orderInput({ tbkOrderId, orderStatus: "settled" }));
    }

    // 模拟后台一键：分批 listStalePending + reconcile，直到无新订单
    const attempted = new Set<string>();
    let fixed = 0;
    for (let i = 0; i < 50; i++) {
      const stale = await repos.commissionLedger.listStalePending(200);
      const fresh = stale.filter((o) => !attempted.has(o.id));
      if (fresh.length === 0) break;
      for (const order of fresh) {
        attempted.add(order.id);
        if ((await reconcileOrderLedger(repos, order, OPTIONS)).credited) fixed += 1;
      }
    }

    expect(fixed).toBe(3);
    expect(await repos.commissionLedger.listStalePending(200)).toHaveLength(0);
    expect(await repos.withdrawals.getAvailableBalance("u0")).toBe(400);
  });
});

describe("标题疑似同款 → 进待复核（不自动、不丢弃）", () => {
  test("相似度 0.55~0.8 的订单进 pending_review，不自动入账", async () => {
    const repos = createRepositories();
    const user = await repos.users.findOrCreateByOpenid("u-fuzzy");
    await repos.conversions.create({
      userId: user.id,
      rawContent: "x",
      platform: "taobao",
      itemId: "CID-FZ", // 与订单 itemId 不同 → 走标题兜底
      itemTitle: "蒙时代内蒙古草原即食酱牛肉熟食",
      itemImageUrl: "",
      itemPriceCents: 0,
      commissionRate: 0,
      estimatedCommissionCents: 1000,
      estimatedRebateCents: 500,
      generatedPassword: "",
      generatedShortUrl: "",
      generatedClickUrl: ""
    });
    const order = await repos.orders.upsert(
      orderInput({
        tbkOrderId: "FZ1",
        itemId: "OID-FZ",
        itemTitle: "内蒙古草原酱牛肉特产即食卤牛肉熟食真空熟非牛腱子肉官方旗舰店",
        orderStatus: "settled",
        payTime: new Date(Date.now() + 60_000)
      })
    );
    await processOrder(repos, order, { commissionSharingRatio: 0.5 });
    const attr = await repos.orders.getAttribution("FZ1");
    expect(attr?.status).toBe("pending_review");
    expect(await repos.withdrawals.getAvailableBalance(user.id)).toBe(0); // 不自动入账
  });
});

describe("标题同款归因兜底（itemId 为空的加密商品）", () => {
  function conv(repos: Repositories, userId: string, itemTitle: string) {
    return repos.conversions.create({
      userId,
      rawContent: "x",
      platform: "taobao",
      itemId: "", // 加密商品：转化侧没有数字 itemId
      itemTitle,
      itemImageUrl: "",
      itemPriceCents: 0,
      commissionRate: 0,
      estimatedCommissionCents: 1000,
      estimatedRebateCents: 500,
      generatedPassword: "",
      generatedShortUrl: "",
      generatedClickUrl: ""
    });
  }

  test("订单长标题 vs 折淘客【】简称标题：唯一候选自动归因入账", async () => {
    const repos = createRepositories();
    const user = await repos.users.findOrCreateByOpenid("liangjiang");
    await conv(repos, user.id, "【益智早教抓握力】彩虹转转塔");

    const orderTitle = "彩虹转转乐叠叠乐宝宝玩具婴幼儿转转塔0-3岁旋转套圈早教礼物";
    const taobaoOrderClient: TaobaoOrderClient = {
      async fetchTaobaoOrders() {
        return {
          orders: [
            {
              tbkOrderId: "TT1",
              itemId: "987654321", // 订单侧是数字 itemId，与转化(空)对不上 → 走标题兜底
              itemTitle: orderTitle,
              payTime: new Date(Date.now() + 60_000),
              payAmountCents: 5000,
              estimatedCommissionCents: 1000,
              settledCommissionCents: 800,
              orderStatus: "settled",
              rawPayload: {}
            }
          ],
          hasNext: false
        };
      }
    };
    const orderClient = { async fetchJdOrders() { return { orders: [], hasNext: false }; } };

    await runOrderSync(repos, { taobaoOrderClient, orderClient }, { commissionSharingRatio: 0.5, attributionWindowHours: 24 }, "auto");

    const attr = await repos.orders.getAttribution("TT1");
    expect(attr?.status).toBe("auto_matched");
    expect(attr?.userId).toBe(user.id);
    expect(await repos.withdrawals.getAvailableBalance(user.id)).toBe(400); // 800 * 0.5 已结算到账
  });
});

describe("商品详情标题统一", () => {
  test("淘宝订单同步按 itemId 使用商品详情标题入库", async () => {
    const repos = createRepositories();
    const taobaoOrderClient = {
      async fetchTaobaoOrders() {
        return {
          orders: [
            {
              tbkOrderId: "PD1",
              itemId: "660000001",
              itemTitle: "短标题",
              payTime: new Date(Date.now() + 60_000),
              payAmountCents: 5000,
              estimatedCommissionCents: 1000,
              settledCommissionCents: null,
              orderStatus: "paid",
              rawPayload: {}
            }
          ],
          hasNext: false
        };
      }
    };
    const taobaoProductClient: TaobaoProductClient = {
      async getProductDetail(itemId: string) {
        expect(itemId).toBe("660000001");
        return {
          platform: "taobao" as const,
          itemId,
          itemTitle: "官方长标题 商品详情标准名称",
          itemImageUrl: "https://img.alicdn.com/detail.jpg",
          itemPriceCents: 5900
        };
      }
    };
    const orderClient: JdOrderClient = { async fetchJdOrders() { return { orders: [], hasNext: false }; } };

    await runOrderSync(
      repos,
      { taobaoOrderClient, taobaoProductClient, orderClient },
      { commissionSharingRatio: 0.5, attributionWindowHours: 24 },
      "auto"
    );

    const { items } = await repos.orders.listAllOrders();
    expect(items[0].itemTitle).toBe("官方长标题 商品详情标准名称");
  });
});

describe("runOrderSync 结算兜底扫描", () => {
  test("除常规更新窗(qt=4)外，额外按结算时间(qt=3)扫一遍", async () => {
    const repos = createRepositories();
    const queryTypes: number[] = [];
    const taobaoOrderClient = {
      async fetchTaobaoOrders(input: { queryType?: number }) {
        queryTypes.push(input.queryType ?? 4);
        return { orders: [], hasNext: false };
      }
    };
    const orderClient = {
      async fetchJdOrders() {
        return { orders: [], hasNext: false };
      }
    };

    const result = await runOrderSync(
      repos,
      { taobaoOrderClient, orderClient },
      { commissionSharingRatio: 0.5 },
      "auto"
    );

    expect(result.ok).toBe(true);
    expect(queryTypes).toContain(4); // 常规更新窗
    expect(queryTypes).toContain(3); // 结算兜底
  });
});
