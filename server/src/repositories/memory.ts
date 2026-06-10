import { randomUUID } from "node:crypto";
import type {
  AdminUserRecord,
  AttributionRecord,
  CommissionLedgerRecord,
  ConversionRecord,
  CopyEventRecord,
  OrderClaimRecord,
  OrderRecord,
  Repositories,
  UpsertAttributionInput,
  UpsertOrderInput,
  UserRecord
} from "./types.js";

export function createRepositories(): Repositories {
  const users = new Map<string, UserRecord>();
  const usersByOpenid = new Map<string, string>();
  const conversions = new Map<string, ConversionRecord>();
  const copyEvents = new Map<string, CopyEventRecord>();
  const orders = new Map<string, OrderRecord>();
  const ordersByTbkOrderId = new Map<string, string>();
  const attributions = new Map<string, AttributionRecord>();
  const attributionsByTbkOrderId = new Map<string, string>();
  const ledger = new Map<string, CommissionLedgerRecord>();
  const claims = new Map<string, OrderClaimRecord>();

  return {
    users: {
      async findOrCreateByOpenid(openid: string, input: { unionid?: string | null } = {}) {
        const existingId = usersByOpenid.get(openid);
        if (existingId) {
          const existing = users.get(existingId)!;
          if (!existing.unionid && input.unionid) {
            existing.unionid = input.unionid;
          }
          return existing;
        }

        const id = `user-${users.size + 1}`;
        const user: UserRecord = {
          id,
          openid,
          unionid: input.unionid ?? null,
          status: "active",
          createdAt: new Date()
        };
        users.set(id, user);
        usersByOpenid.set(openid, id);
        return user;
      },
      async findById(id: string) {
        return users.get(id);
      },
      async updateStatus(id: string, status) {
        const user = users.get(id);
        if (!user) {
          throw new Error(`user not found: ${id}`);
        }
        user.status = status;
        return user;
      },
      async list(): Promise<AdminUserRecord[]> {
        return [...users.values()].map((user) => ({
          ...user,
          conversionCount: [...conversions.values()].filter((record) => record.userId === user.id).length,
          copyEventCount: [...copyEvents.values()].filter((record) => record.userId === user.id).length,
          claimCount: [...claims.values()].filter((record) => record.userId === user.id).length
        }));
      }
    },
    conversions: {
      async create(input: Omit<ConversionRecord, "id" | "createdAt">) {
        const record: ConversionRecord = {
          id: randomUUID(),
          createdAt: new Date(),
          ...input
        };
        conversions.set(record.id, record);
        return record;
      },
      async findById(id: string) {
        return conversions.get(id);
      },
      async listByUser(userId: string) {
        return [...conversions.values()].filter((record) => record.userId === userId);
      }
    },
    copyEvents: {
      async create(input: Omit<CopyEventRecord, "id" | "copiedAt">) {
        const record: CopyEventRecord = {
          id: randomUUID(),
          copiedAt: new Date(),
          ...input
        };
        copyEvents.set(record.id, record);
        return record;
      },
      async count() {
        return copyEvents.size;
      },
      async listByItem(itemId: string) {
        return [...copyEvents.values()].filter((record) => record.itemId === itemId);
      }
    },
    orders: {
      async listByUser(userId: string) {
        return [...attributions.values()]
          .filter((attribution) => attribution.userId === userId)
          .map((attribution) => {
            const order = orders.get(attribution.tbkOrderId)!;
            const userLedger = [...ledger.values()]
              .filter((entry) => entry.userId === userId && entry.tbkOrderId === order.id)
              .reduce((total, entry) => total + entry.amountCents, 0);
            return {
              id: order.id,
              itemTitle: order.itemTitle,
              status: order.orderStatus,
              estimatedCommissionCents: order.estimatedCommissionCents,
              userRebateCents: userLedger
            };
          });
      },
      async upsert(input: UpsertOrderInput) {
        const existingId = ordersByTbkOrderId.get(input.tbkOrderId);
        const record: OrderRecord = {
          id: existingId ?? randomUUID(),
          ...input
        };
        orders.set(record.id, record);
        ordersByTbkOrderId.set(input.tbkOrderId, record.id);
        return record;
      },
      async upsertAttribution(input: UpsertAttributionInput) {
        const orderId = ordersByTbkOrderId.get(input.tbkOrderId);
        if (!orderId) {
          throw new Error(`order not found: ${input.tbkOrderId}`);
        }
        const existingId = attributionsByTbkOrderId.get(orderId);
        const record: AttributionRecord = {
          id: existingId ?? randomUUID(),
          tbkOrderId: orderId,
          userId: input.userId ?? null,
          conversionId: input.conversionId ?? null,
          copyEventId: input.copyEventId ?? null,
          status: input.status,
          confidence: input.confidence,
          reason: input.reason,
          createdAt: existingId ? attributions.get(existingId)!.createdAt : new Date()
        };
        attributions.set(record.id, record);
        attributionsByTbkOrderId.set(orderId, record.id);
        return record;
      },
      async listPendingAttributions() {
        return [...attributions.values()]
          .filter((record) => record.status === "pending_review" || record.status === "unmatched")
          .map((record) => ({ ...record, order: orders.get(record.tbkOrderId)! }));
      },
      async attributeOrder(id: string, input: { userId?: string | null; reviewedBy?: string }) {
        const existing = attributions.get(id);
        if (!existing) {
          throw new Error(`attribution not found: ${id}`);
        }
        const updated: AttributionRecord = {
          ...existing,
          userId: input.userId ?? existing.userId,
          status: "manual_matched",
          reason: `manual_review:${input.reviewedBy ?? "admin"}`
        };
        attributions.set(id, updated);
        return updated;
      },
      async createClaim(input: {
        userId: string;
        orderSuffix: string;
        screenshotUrl?: string | null;
        notes?: string | null;
      }) {
        const record: OrderClaimRecord = {
          id: randomUUID(),
          userId: input.userId,
          orderSuffix: input.orderSuffix,
          screenshotUrl: input.screenshotUrl ?? null,
          notes: input.notes ?? null,
          status: "pending_review",
          createdAt: new Date()
        };
        claims.set(record.id, record);
        return record;
      },
      async listClaims(status?: string) {
        return [...claims.values()]
          .filter((claim) => !status || claim.status === status)
          .map((claim) => ({
            ...claim,
            userOpenid: users.get(claim.userId)?.openid ?? ""
          }));
      },
      async reviewClaim(id: string, input: { status: "approved" | "rejected"; reviewedBy?: string }) {
        const claim = claims.get(id);
        if (!claim) {
          throw new Error(`claim not found: ${id}`);
        }
        claim.status = input.status;
        claims.set(id, claim);
        return claim;
      }
    },
    commissionLedger: {
      async upsert(input) {
        const existing = [...ledger.values()].find(
          (entry) =>
            entry.userId === input.userId &&
            entry.tbkOrderId === input.tbkOrderId &&
            entry.ledgerType === input.ledgerType
        );
        if (existing) {
          const updated = { ...existing, ...input };
          ledger.set(existing.id, updated);
          return updated;
        }

        const record: CommissionLedgerRecord = {
          id: randomUUID(),
          createdAt: new Date(),
          ...input
        };
        ledger.set(record.id, record);
        return record;
      }
    },
    admin: {
      async overview() {
        return {
          userCount: users.size,
          conversionCount: conversions.size,
          copyEventCount: copyEvents.size,
          pendingAttributionCount: [...attributions.values()].filter(
            (record) => record.status === "pending_review" || record.status === "unmatched"
          ).length,
          orderClaimCount: claims.size
        };
      }
    }
  };
}
