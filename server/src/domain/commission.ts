export type OrderCommissionStatus = "paid" | "settled" | "refunded" | "invalid";

export type BuildCommissionInput = {
  userId: string;
  tbkOrderId: string;
  orderStatus: OrderCommissionStatus;
  estimatedCommissionCents: number;
  settledCommissionCents: number | null;
  sharingRatio: number;
};

export type CommissionLedgerEntry = {
  userId: string;
  tbkOrderId: string;
  amountCents: number;
  ledgerType: "estimated" | "settled" | "reversal";
  status: "pending" | "available" | "reversed";
  reason: string;
};

export function buildCommissionLedgerEntry(input: BuildCommissionInput): CommissionLedgerEntry {
  if (input.sharingRatio < 0 || input.sharingRatio > 1) {
    throw new Error("sharingRatio must be between 0 and 1");
  }

  if (input.orderStatus === "settled") {
    const baseCents = input.settledCommissionCents ?? input.estimatedCommissionCents;
    return {
      userId: input.userId,
      tbkOrderId: input.tbkOrderId,
      amountCents: calculateShare(baseCents, input.sharingRatio),
      ledgerType: "settled",
      status: "available",
      reason: "order_settled"
    };
  }

  if (input.orderStatus === "refunded" || input.orderStatus === "invalid") {
    return {
      userId: input.userId,
      tbkOrderId: input.tbkOrderId,
      amountCents: -calculateShare(input.estimatedCommissionCents, input.sharingRatio),
      ledgerType: "reversal",
      status: "reversed",
      reason: `order_${input.orderStatus}`
    };
  }

  return {
    userId: input.userId,
    tbkOrderId: input.tbkOrderId,
    amountCents: calculateShare(input.estimatedCommissionCents, input.sharingRatio),
    ledgerType: "estimated",
    status: "pending",
    reason: "paid_order_estimated_commission"
  };
}

function calculateShare(amountCents: number, sharingRatio: number): number {
  return Math.round(amountCents * sharingRatio);
}
