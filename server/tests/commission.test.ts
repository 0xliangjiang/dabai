import { describe, expect, test } from "vitest";
import { buildCommissionLedgerEntry, buildReferralLedgerEntry } from "../src/domain/commission.js";

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

describe("buildReferralLedgerEntry", () => {
  const downlineEntry = {
    userId: "downline",
    tbkOrderId: "order-1",
    amountCents: 600,
    ledgerType: "estimated" as const,
    status: "pending" as const,
    reason: "paid_order_estimated_commission"
  };

  test("mirrors the downline entry's status into a referral_* type, scaled by ratio", () => {
    const entry = buildReferralLedgerEntry(downlineEntry, "inviter", 0.2);
    expect(entry).toEqual({
      userId: "inviter",
      tbkOrderId: "order-1",
      amountCents: 120,
      ledgerType: "referral_estimated",
      status: "pending",
      reason: "referral_commission"
    });
  });

  test("settled downline → available referral", () => {
    const entry = buildReferralLedgerEntry(
      { ...downlineEntry, amountCents: 500, ledgerType: "settled", status: "available" },
      "inviter",
      0.2
    );
    expect(entry.amountCents).toBe(100);
    expect(entry.ledgerType).toBe("referral_settled");
    expect(entry.status).toBe("available");
  });

  test("reversed downline → negative reversed referral", () => {
    const entry = buildReferralLedgerEntry(
      { ...downlineEntry, amountCents: -600, ledgerType: "reversal", status: "reversed" },
      "inviter",
      0.2
    );
    expect(entry.amountCents).toBe(-120);
    expect(entry.ledgerType).toBe("referral_reversal");
    expect(entry.status).toBe("reversed");
  });
});
