import { randomUUID } from "node:crypto";
import { resolveEffectiveStatus } from "../domain/order-status.js";
import type {
  AdminUserRecord,
  AdminWithdrawalRecord,
  AttributionRecord,
  DownlineRecord,
  CheckInRecord,
  DealPostInput,
  DealPostRecord,
  CommissionLedgerRecord,
  ConversionRecord,
  CopyEventRecord,
  OrderClaimRecord,
  OrderRecord,
  OrderSyncRunRecord,
  Repositories,
  UpsertAttributionInput,
  UpsertOrderInput,
  UserRecord,
  WithdrawalRecord
} from "./types.js";

const COMMISSION_RATIO_KEY = "commission_sharing_ratio";
const EXCHANGE_ENABLED_KEY = "exchange_enabled";
const REFERRAL_RATIO_KEY = "referral_commission_ratio";
const REFERRAL_ENABLED_KEY = "referral_enabled";

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
  const checkIns = new Map<string, CheckInRecord>();
  const deals = new Map<string, DealPostRecord>();
  const dealVisits = new Set<string>();
  const withdrawalMap = new Map<string, WithdrawalRecord>();
  const deletedUserIds = new Set<string>();
  const pointAdjustments = new Map<string, { id: string; userId: string; amountCents: number }>();
  const settingsMap = new Map<string, string>();
  const subscribeGrants = new Map<
    string,
    { id: string; userId: string; templateId: string; used: boolean }
  >();
  const syncRunList: OrderSyncRunRecord[] = [];

  return {
    users: {
      async findOrCreateByOpenid(
        openid: string,
        input: { unionid?: string | null; inviterId?: string | null } = {}
      ) {
        const existingId = usersByOpenid.get(openid);
        if (existingId) {
          const existing = users.get(existingId)!;
          if (!existing.unionid && input.unionid) {
            existing.unionid = input.unionid;
          }
          deletedUserIds.delete(existingId);
          return existing;
        }

        // 二级分销绑定仅新用户首次注册生效：校验邀请人存在且未软删，无效则置 null
        let inviterId: string | null = null;
        if (input.inviterId && users.has(input.inviterId) && !deletedUserIds.has(input.inviterId)) {
          inviterId = input.inviterId;
        }

        const id = `user-${users.size + 1}`;
        const user: UserRecord = {
          id,
          openid,
          unionid: input.unionid ?? null,
          nickname: null,
          avatarUrl: null,
          status: "active",
          rebateRatio: null,
          inviterId,
          createdAt: new Date()
        };
        users.set(id, user);
        usersByOpenid.set(openid, id);
        deletedUserIds.delete(id);
        return user;
      },
      async findById(id: string) {
        if (deletedUserIds.has(id)) return undefined;
        return users.get(id);
      },
      async getOrReviveById(id: string) {
        const user = users.get(id);
        if (!user) return undefined;
        // 删除后又回来用 app 的用户：自动复活
        deletedUserIds.delete(id);
        return user;
      },
      async updateStatus(id: string, status) {
        const user = users.get(id);
        if (!user) {
          throw new Error(`user not found: ${id}`);
        }
        user.status = status;
        return user;
      },
      async updateProfile(id: string, input: { nickname?: string; avatarUrl?: string }) {
        const user = users.get(id);
        if (!user) {
          throw new Error(`user not found: ${id}`);
        }
        if (input.nickname !== undefined) user.nickname = input.nickname;
        if (input.avatarUrl !== undefined) user.avatarUrl = input.avatarUrl;
        return user;
      },
      async list(): Promise<AdminUserRecord[]> {
        const activeUsers = [...users.values()].filter((user) => !deletedUserIds.has(user.id));
        return activeUsers.map((user) => ({
          ...user,
          conversionCount: [...conversions.values()].filter((record) => record.userId === user.id).length,
          copyEventCount: [...copyEvents.values()].filter((record) => record.userId === user.id).length,
          claimCount: [...claims.values()].filter((record) => record.userId === user.id).length,
          inviterNickname: user.inviterId ? users.get(user.inviterId)?.nickname ?? null : null,
          downlineCount: activeUsers.filter((u) => u.inviterId === user.id).length
        }));
      },
      async listDownline(inviterId: string): Promise<DownlineRecord[]> {
        const refEntries = [...ledger.values()].filter(
          (e) => e.userId === inviterId && e.ledgerType.startsWith("referral_")
        );
        const contributedByUser = new Map<string, number>();
        for (const e of refEntries) {
          // 提成台账的 tbkOrderId 存的是内部 order.id；attributionsByTbkOrderId 也按内部 id 索引
          const attrId = attributionsByTbkOrderId.get(e.tbkOrderId);
          const downlineId = attrId ? attributions.get(attrId)?.userId : undefined;
          if (!downlineId) continue;
          contributedByUser.set(downlineId, (contributedByUser.get(downlineId) ?? 0) + e.amountCents);
        }
        return [...users.values()]
          .filter((u) => u.inviterId === inviterId && !deletedUserIds.has(u.id))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((u) => ({
            id: u.id,
            nickname: u.nickname,
            openid: u.openid,
            createdAt: u.createdAt,
            contributedCents: contributedByUser.get(u.id) ?? 0
          }));
      },
      async deleteUser(id: string) {
        deletedUserIds.add(id);
      },
      async adjustPoints(id: string, input: { delta: number; reason: string }) {
        const adjId = `adj-${pointAdjustments.size + 1}`;
        pointAdjustments.set(adjId, { id: adjId, userId: id, amountCents: input.delta });
      },
      async setRebateRatio(id: string, ratio: number | null) {
        const user = users.get(id);
        if (!user) throw new Error(`user not found: ${id}`);
        user.rebateRatio = ratio;
        return user;
      },
      async referralSummary(userId: string) {
        const downlineCount = [...users.values()].filter(
          (u) => u.inviterId === userId && !deletedUserIds.has(u.id)
        ).length;
        const entries = [...ledger.values()].filter(
          (e) => e.userId === userId && e.ledgerType.startsWith("referral_")
        );
        const sum = (status: string) =>
          entries.filter((e) => e.status === status).reduce((t, e) => t + e.amountCents, 0);
        return { downlineCount, earnedCents: sum("available"), pendingCents: sum("pending") };
      }
    },
    settings: {
      async getCommissionSharingRatio() {
        const v = settingsMap.get(COMMISSION_RATIO_KEY);
        if (v === undefined) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      },
      async setCommissionSharingRatio(ratio: number) {
        settingsMap.set(COMMISSION_RATIO_KEY, String(ratio));
      },
      async getExchangeEnabled() {
        return settingsMap.get(EXCHANGE_ENABLED_KEY) === "1";
      },
      async setExchangeEnabled(enabled: boolean) {
        settingsMap.set(EXCHANGE_ENABLED_KEY, enabled ? "1" : "0");
      },
      async getReferralRatio() {
        const v = settingsMap.get(REFERRAL_RATIO_KEY);
        if (v === undefined) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      },
      async setReferralRatio(ratio: number) {
        settingsMap.set(REFERRAL_RATIO_KEY, String(ratio));
      },
      async getReferralEnabled() {
        return settingsMap.get(REFERRAL_ENABLED_KEY) === "1";
      },
      async setReferralEnabled(enabled: boolean) {
        settingsMap.set(REFERRAL_ENABLED_KEY, enabled ? "1" : "0");
      },
      async getOverrides() {
        return Object.fromEntries(settingsMap.entries());
      },
      async setMany(entries: Array<{ key: string; value: string }>) {
        for (const e of entries) settingsMap.set(e.key, e.value);
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
      },
      async listByItem(itemId: string) {
        return [...conversions.values()].filter((record) => record.itemId === itemId);
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
              payTime: order.payTime,
              payAmountCents: order.payAmountCents,
              estimatedCommissionCents: order.estimatedCommissionCents,
              settledCommissionCents: order.settledCommissionCents,
              userRebateCents: userLedger
            };
          });
      },
      async upsert(input: UpsertOrderInput) {
        const existingId = ordersByTbkOrderId.get(input.tbkOrderId);
        const manualStatus = (existingId ? orders.get(existingId)?.manualStatus : null) ?? null;
        const record: OrderRecord = {
          id: existingId ?? randomUUID(),
          ...input,
          orderStatus: resolveEffectiveStatus(input.orderStatus, manualStatus),
          manualStatus
        };
        orders.set(record.id, record);
        ordersByTbkOrderId.set(input.tbkOrderId, record.id);
        return record;
      },
      async markOrderStatus(id: string, status: string) {
        const order = orders.get(id);
        if (!order) throw new Error(`order not found: ${id}`);
        order.manualStatus = status;
        order.orderStatus = status;
        return order;
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
      async getAttribution(tbkOrderId: string) {
        const orderId = ordersByTbkOrderId.get(tbkOrderId);
        if (!orderId) return null;
        const attrId = attributionsByTbkOrderId.get(orderId);
        const attr = attrId ? attributions.get(attrId) : undefined;
        return attr ? { status: attr.status, userId: attr.userId } : null;
      },
      async listPendingAttributions() {
        return [...attributions.values()]
          .filter((record) => record.status === "pending_review" || record.status === "unmatched")
          .map((record) => ({ ...record, order: orders.get(record.tbkOrderId)! }));
      },
      async listAllOrders(options?: { page?: number; pageSize?: number; orderStatus?: string; attributionStatus?: string }) {
        const page = Math.max(1, options?.page ?? 1);
        const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 50));
        let items = [...orders.values()].sort((a, b) => b.payTime.getTime() - a.payTime.getTime());
        if (options?.orderStatus) items = items.filter((o) => o.orderStatus === options.orderStatus);
        const total = items.length;
        return {
          total,
          items: items.slice((page - 1) * pageSize, page * pageSize).map((o) => {
            const attrId = attributionsByTbkOrderId.get(o.id);
            const attr = attrId ? attributions.get(attrId) ?? null : null;
            return { ...o, attribution: attr ? { ...attr, userNickname: null } : null };
          })
        };
      },
      async findByOrderNumber(orderNumber: string) {
        const suffix = orderNumber.trim();
        const order = [...orders.values()].find(
          (o) => o.tbkOrderId === suffix || o.tbkOrderId.endsWith(suffix)
        );
        if (!order) return undefined;
        const attributionId = attributionsByTbkOrderId.get(order.id);
        return {
          order,
          attribution: attributionId ? (attributions.get(attributionId) ?? null) : null
        };
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
    subscriptions: {
      async addGrant(userId: string, templateId: string) {
        const id = randomUUID();
        subscribeGrants.set(id, { id, userId, templateId, used: false });
      },
      async countUnused(userId: string, templateId: string) {
        return [...subscribeGrants.values()].filter(
          (grant) => grant.userId === userId && grant.templateId === templateId && !grant.used
        ).length;
      },
      async listUnusedWithOpenid(templateId: string) {
        const seen = new Set<string>();
        const result: Array<{ grantId: string; userId: string; openid: string }> = [];
        for (const grant of subscribeGrants.values()) {
          if (grant.templateId !== templateId || grant.used || seen.has(grant.userId)) continue;
          const user = users.get(grant.userId);
          if (!user) continue;
          seen.add(grant.userId);
          result.push({ grantId: grant.id, userId: grant.userId, openid: user.openid });
        }
        return result;
      },
      async markUsed(grantIds: string[]) {
        for (const id of grantIds) {
          const grant = subscribeGrants.get(id);
          if (grant) grant.used = true;
        }
      }
    },
    deals: {
      async list(publishedOnly: boolean) {
        // 带插入序号做时间相同时的次级排序（同一毫秒创建时保证后创建的在前）
        return [...deals.values()]
          .map((deal, index) => ({ deal, index }))
          .filter(({ deal }) => !publishedOnly || deal.status === "published")
          .sort((a, b) => {
            if (a.deal.pinned !== b.deal.pinned) return a.deal.pinned ? -1 : 1;
            const aTime = (a.deal.publishedAt ?? a.deal.createdAt).getTime();
            const bTime = (b.deal.publishedAt ?? b.deal.createdAt).getTime();
            if (bTime !== aTime) return bTime - aTime;
            return b.index - a.index;
          })
          .map(({ deal }) => deal);
      },
      async findById(id: string) {
        return deals.get(id);
      },
      async create(input: DealPostInput) {
        const record: DealPostRecord = {
          id: randomUUID(),
          title: input.title,
          summary: input.summary ?? null,
          status: input.status,
          pinned: input.pinned ?? false,
          steps: input.steps,
          viewCount: 0,
          visitorCount: 0,
          publishedAt: input.status === "published" ? new Date() : null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        deals.set(record.id, record);
        return record;
      },
      async update(id: string, input: DealPostInput) {
        const existing = deals.get(id);
        if (!existing) {
          throw new Error(`deal not found: ${id}`);
        }
        const updated: DealPostRecord = {
          ...existing,
          title: input.title,
          summary: input.summary ?? null,
          status: input.status,
          pinned: input.pinned ?? existing.pinned,
          steps: input.steps,
          publishedAt:
            input.status === "published" && !existing.publishedAt ? new Date() : existing.publishedAt,
          updatedAt: new Date()
        };
        deals.set(id, updated);
        return updated;
      },
      async remove(id: string) {
        deals.delete(id);
      },
      async recordView(id: string, visitorKey: string) {
        const deal = deals.get(id);
        if (!deal) return;
        deal.viewCount += 1;
        const visitKey = `${id}:${visitorKey}`;
        if (!dealVisits.has(visitKey)) {
          dealVisits.add(visitKey);
          deal.visitorCount += 1;
        }
      }
    },
    checkIns: {
      async findByUserAndDate(userId: string, checkInDate: string) {
        return [...checkIns.values()].find(
          (record) => record.userId === userId && record.checkInDate === checkInDate
        );
      },
      async create(input: { userId: string; checkInDate: string; points: number }) {
        const record: CheckInRecord = {
          id: randomUUID(),
          createdAt: new Date(),
          ...input
        };
        checkIns.set(record.id, record);
        return record;
      },
      async listRecentDates(userId: string, limit: number) {
        return [...checkIns.values()]
          .filter((record) => record.userId === userId)
          .map((record) => record.checkInDate)
          .sort()
          .reverse()
          .slice(0, limit);
      },
      async totalPoints(userId: string) {
        return [...checkIns.values()]
          .filter((record) => record.userId === userId)
          .reduce((total, record) => total + record.points, 0);
      }
    },
    withdrawals: {
      async create(input) {
        const now = new Date();
        const record: WithdrawalRecord = {
          id: randomUUID(),
          userId: input.userId,
          amountCents: input.amountCents,
          status: "pending",
          payAccount: input.payAccount,
          payType: input.payType,
          notes: input.notes ?? null,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now
        };
        withdrawalMap.set(record.id, record);
        return record;
      },
      async listByUser(userId: string) {
        return [...withdrawalMap.values()]
          .filter((r) => r.userId === userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      },
      async getAvailableBalance(userId: string) {
        const earned = [...ledger.values()]
          .filter((r) => r.userId === userId && r.status === "available")
          .reduce((sum, r) => sum + r.amountCents, 0);
        // 100积分=1元，即 1积分=1分；签到积分与推广佣金合并为可提现余额
        const points = [...checkIns.values()]
          .filter((r) => r.userId === userId)
          .reduce((sum, r) => sum + r.points, 0);
        const adjustment = [...pointAdjustments.values()]
          .filter((r) => r.userId === userId)
          .reduce((sum, r) => sum + r.amountCents, 0);
        const requested = [...withdrawalMap.values()]
          .filter((r) => r.userId === userId && (r.status === "pending" || r.status === "paid"))
          .reduce((sum, r) => sum + r.amountCents, 0);
        return Math.max(0, earned + points + adjustment - requested);
      },
      async list(status?: string) {
        const records = [...withdrawalMap.values()]
          .filter((r) => !status || r.status === status)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return records.map((r): AdminWithdrawalRecord => {
          const user = users.get(r.userId);
          return {
            ...r,
            userNickname: user?.nickname ?? null,
            userOpenid: user?.openid ?? ""
          };
        });
      },
      async review(id: string, input: { status: "paid" | "rejected"; reviewedBy?: string; notes?: string | null }) {
        const record = withdrawalMap.get(id);
        if (!record) throw new Error("Withdrawal not found");
        const updated: WithdrawalRecord = {
          ...record,
          status: input.status,
          reviewedBy: input.reviewedBy ?? "admin",
          reviewedAt: new Date(),
          updatedAt: new Date(),
          ...(input.notes !== undefined ? { notes: input.notes } : {})
        };
        withdrawalMap.set(id, updated);
        return updated;
      }
    },
    syncRuns: {
      async record(input) {
        syncRunList.push({ ...input, id: randomUUID(), createdAt: new Date() });
      },
      async getLatest() {
        return syncRunList.length > 0 ? syncRunList[syncRunList.length - 1] : null;
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
