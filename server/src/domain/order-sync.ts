import { matchOrderAttribution } from "./attribution.js";
import { buildCommissionLedgerEntry, type OrderCommissionStatus } from "./commission.js";
import type { JdOrderClient } from "../integrations/jd/orders.js";
import type { Repositories } from "../repositories/types.js";

export type SyncOrdersOptions = {
  startTime?: Date;
  endTime?: Date;
  pageSize?: number;
  attributionWindowHours?: number;
  commissionSharingRatio: number;
};

export async function syncJdOrders(
  repositories: Repositories,
  orderClient: JdOrderClient,
  options: SyncOrdersOptions
) {
  const endTime = options.endTime ?? new Date();
  const startTime = options.startTime ?? new Date(endTime.getTime() - 30 * 60 * 1000);
  const pageSize = options.pageSize ?? 100;
  let pageIndex = 1;
  let synced = 0;
  let attributed = 0;

  while (true) {
    const page = await orderClient.fetchJdOrders({ startTime, endTime, pageIndex, pageSize });
    for (const incoming of page.orders) {
      const order = await repositories.orders.upsert(incoming);
      const copyEvents = await repositories.copyEvents.listByItem(order.itemId);
      const attribution = matchOrderAttribution(
        {
          id: order.id,
          itemId: order.itemId,
          paidAt: order.payTime
        },
        copyEvents,
        { windowHours: options.attributionWindowHours }
      );

      await repositories.orders.upsertAttribution({
        tbkOrderId: order.tbkOrderId,
        status: attribution.status,
        confidence: attribution.confidence,
        reason: attribution.reason,
        userId: "userId" in attribution ? attribution.userId : null,
        conversionId: "conversionId" in attribution ? attribution.conversionId : null,
        copyEventId: "copyEventId" in attribution ? attribution.copyEventId : null
      });

      if (attribution.status === "auto_matched") {
        attributed += 1;
        const entry = buildCommissionLedgerEntry({
          userId: attribution.userId,
          tbkOrderId: order.id,
          orderStatus: normalizeCommissionStatus(order.orderStatus),
          estimatedCommissionCents: order.estimatedCommissionCents,
          settledCommissionCents: order.settledCommissionCents,
          sharingRatio: options.commissionSharingRatio
        });
        await repositories.commissionLedger.upsert(entry);
      }

      synced += 1;
    }

    if (!page.hasNext || page.orders.length === 0) {
      break;
    }
    pageIndex += 1;
  }

  return {
    ok: true,
    synced,
    attributed,
    startTime,
    endTime
  };
}

function normalizeCommissionStatus(status: string): OrderCommissionStatus {
  if (status === "settled" || status === "refunded" || status === "invalid") {
    return status;
  }
  return "paid";
}
