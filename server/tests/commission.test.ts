import { describe, expect, test } from "vitest";
import { buildCommissionLedgerEntry } from "../src/domain/commission.js";

describe("buildCommissionLedgerEntry", () => {
  test("creates an estimated ledger entry from estimated commission and sharing ratio", () => {
    const entry = buildCommissionLedgerEntry({
      userId: "user-1",
      tbkOrderId: "order-1",
      orderStatus: "paid",
      estimatedCommissionCents: 1234,
      settledCommissionCents: null,
      sharingRatio: 0.5
    });

    expect(entry).toEqual({
      userId: "user-1",
      tbkOrderId: "order-1",
      amountCents: 617,
      ledgerType: "estimated",
      status: "pending",
      reason: "paid_order_estimated_commission"
    });
  });

  test("creates a settled ledger entry from settled commission", () => {
    const entry = buildCommissionLedgerEntry({
      userId: "user-1",
      tbkOrderId: "order-1",
      orderStatus: "settled",
      estimatedCommissionCents: 1234,
      settledCommissionCents: 1000,
      sharingRatio: 0.5
    });

    expect(entry.amountCents).toBe(500);
    expect(entry.ledgerType).toBe("settled");
    expect(entry.status).toBe("available");
  });

  test("creates a reversal ledger entry for invalid or refunded orders", () => {
    const entry = buildCommissionLedgerEntry({
      userId: "user-1",
      tbkOrderId: "order-1",
      orderStatus: "refunded",
      estimatedCommissionCents: 1234,
      settledCommissionCents: null,
      sharingRatio: 0.5
    });

    expect(entry).toEqual({
      userId: "user-1",
      tbkOrderId: "order-1",
      amountCents: -617,
      ledgerType: "reversal",
      status: "reversed",
      reason: "order_refunded"
    });
  });
});
