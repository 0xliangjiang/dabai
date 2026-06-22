import { beforeEach, describe, expect, test } from "vitest";
import { createRepositories } from "../src/repositories/memory.js";
import { reconcileOrderLedger } from "../src/domain/order-sync.js";
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
