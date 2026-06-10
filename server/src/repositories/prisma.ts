import { Prisma, PrismaClient } from "@prisma/client";
import type {
  AdminUserRecord,
  AttributionRecord,
  DealPostRecord,
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

export function createPrismaRepositories(databaseUrl?: string): Repositories {
  const prisma = databaseUrl ? new PrismaClient({ datasourceUrl: databaseUrl }) : new PrismaClient();
  return {
    users: {
      async findOrCreateByOpenid(openid: string, input: { unionid?: string | null } = {}) {
        const user = await prisma.user.upsert({
          where: { openid },
          create: { openid, unionid: input.unionid ?? null },
          update: input.unionid ? { unionid: input.unionid } : {}
        });
        return mapUser(user);
      },
      async findById(id: string) {
        const user = await prisma.user.findUnique({ where: { id } });
        return user ? mapUser(user) : undefined;
      },
      async updateStatus(id: string, status) {
        const user = await prisma.user.update({ where: { id }, data: { status } });
        return mapUser(user);
      },
      async updateProfile(id: string, input: { nickname?: string; avatarUrl?: string }) {
        const user = await prisma.user.update({
          where: { id },
          data: {
            ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
            ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {})
          }
        });
        return mapUser(user);
      },
      async list(): Promise<AdminUserRecord[]> {
        const users = await prisma.user.findMany({
          orderBy: { createdAt: "desc" },
          include: {
            _count: {
              select: {
                conversions: true,
                copyEvents: true,
                orderClaims: true
              }
            }
          }
        });

        return users.map((user) => ({
          ...mapUser(user),
          conversionCount: user._count.conversions,
          copyEventCount: user._count.copyEvents,
          claimCount: user._count.orderClaims
        }));
      }
    },
    conversions: {
      async create(input: Omit<ConversionRecord, "id" | "createdAt">) {
        const record = await prisma.conversion.create({
          data: {
            userId: input.userId,
            rawContent: input.rawContent,
            platform: input.platform,
            itemId: input.itemId,
            itemTitle: input.itemTitle,
            itemImageUrl: input.itemImageUrl || null,
            itemPriceCents: input.itemPriceCents,
            commissionRate: input.commissionRate,
            estimatedCommissionCents: input.estimatedCommissionCents,
            estimatedRebateCents: input.estimatedRebateCents,
            generatedPassword: input.generatedPassword,
            generatedShortUrl: input.generatedShortUrl,
            generatedClickUrl: input.generatedClickUrl
          }
        });
        return mapConversion(record);
      },
      async findById(id: string) {
        const record = await prisma.conversion.findUnique({ where: { id } });
        return record ? mapConversion(record) : undefined;
      },
      async listByUser(userId: string) {
        const records = await prisma.conversion.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" }
        });
        return records.map(mapConversion);
      }
    },
    copyEvents: {
      async create(input: Omit<CopyEventRecord, "id" | "copiedAt">) {
        const record = await prisma.copyEvent.create({
          data: {
            conversionId: input.conversionId,
            userId: input.userId,
            itemId: input.itemId,
            copyType: input.copyType
          }
        });
        return mapCopyEvent(record);
      },
      async count() {
        return prisma.copyEvent.count();
      },
      async listByItem(itemId: string) {
        const records = await prisma.copyEvent.findMany({
          where: { itemId },
          orderBy: { copiedAt: "desc" }
        });
        return records.map(mapCopyEvent);
      }
    },
    orders: {
      async listByUser(userId: string) {
        const records = await prisma.orderAttribution.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          include: {
            tbkOrder: true,
            user: { include: { commissionLedger: true } }
          }
        });

        return records.map((record) => {
          const userRebateCents = record.user?.commissionLedger
            .filter((entry) => entry.tbkOrderId === record.tbkOrderId)
            .reduce((total, entry) => total + entry.amountCents, 0);
          return {
            id: record.tbkOrder.id,
            itemTitle: record.tbkOrder.itemTitle,
            status: record.tbkOrder.orderStatus,
            estimatedCommissionCents: record.tbkOrder.estimatedCommissionCents,
            userRebateCents: userRebateCents ?? 0
          };
        });
      },
      async upsert(input: UpsertOrderInput) {
        const record = await prisma.tbkOrder.upsert({
          where: { tbkOrderId: input.tbkOrderId },
          create: {
            tbkOrderId: input.tbkOrderId,
            itemId: input.itemId,
            itemTitle: input.itemTitle,
            payTime: input.payTime,
            payAmountCents: input.payAmountCents,
            estimatedCommissionCents: input.estimatedCommissionCents,
            settledCommissionCents: input.settledCommissionCents,
            orderStatus: input.orderStatus,
            rawPayload: toJsonValue(input.rawPayload)
          },
          update: {
            itemId: input.itemId,
            itemTitle: input.itemTitle,
            payTime: input.payTime,
            payAmountCents: input.payAmountCents,
            estimatedCommissionCents: input.estimatedCommissionCents,
            settledCommissionCents: input.settledCommissionCents,
            orderStatus: input.orderStatus,
            rawPayload: toJsonValue(input.rawPayload),
            syncedAt: new Date()
          }
        });
        return mapOrder(record);
      },
      async upsertAttribution(input: UpsertAttributionInput) {
        const order = await prisma.tbkOrder.findUniqueOrThrow({
          where: { tbkOrderId: input.tbkOrderId }
        });
        const record = await prisma.orderAttribution.upsert({
          where: { tbkOrderId: order.id },
          create: {
            tbkOrderId: order.id,
            userId: input.userId ?? null,
            conversionId: input.conversionId ?? null,
            copyEventId: input.copyEventId ?? null,
            status: input.status,
            confidence: input.confidence,
            reason: input.reason
          },
          update: {
            userId: input.userId ?? null,
            conversionId: input.conversionId ?? null,
            copyEventId: input.copyEventId ?? null,
            status: input.status,
            confidence: input.confidence,
            reason: input.reason
          }
        });
        return mapAttribution(record);
      },
      async listPendingAttributions() {
        const records = await prisma.orderAttribution.findMany({
          where: { status: { in: ["pending_review", "unmatched"] } },
          orderBy: { createdAt: "desc" },
          include: { tbkOrder: true }
        });
        return records.map((record) => ({
          ...mapAttribution(record),
          order: mapOrder(record.tbkOrder)
        }));
      },
      async attributeOrder(id: string, input: { userId?: string | null; reviewedBy?: string }) {
        const record = await prisma.orderAttribution.update({
          where: { id },
          data: {
            userId: input.userId ?? undefined,
            status: "manual_matched",
            confidence: 1,
            reason: `manual_review:${input.reviewedBy ?? "admin"}`,
            reviewedBy: input.reviewedBy ?? "admin",
            reviewedAt: new Date()
          }
        });
        return mapAttribution(record);
      },
      async createClaim(input: {
        userId: string;
        orderSuffix: string;
        screenshotUrl?: string | null;
        notes?: string | null;
      }) {
        const record = await prisma.orderClaim.create({
          data: {
            userId: input.userId,
            orderSuffix: input.orderSuffix,
            screenshotUrl: input.screenshotUrl ?? null,
            notes: input.notes ?? null,
            status: "pending_review"
          }
        });
        return mapClaim(record);
      },
      async listClaims(status?: string) {
        const records = await prisma.orderClaim.findMany({
          where: status ? { status } : undefined,
          orderBy: { createdAt: "desc" },
          include: { user: { select: { openid: true } } }
        });
        return records.map((record) => ({
          ...mapClaim(record),
          userOpenid: record.user.openid
        }));
      },
      async reviewClaim(id: string, input: { status: "approved" | "rejected"; reviewedBy?: string }) {
        const record = await prisma.orderClaim.update({
          where: { id },
          data: {
            status: input.status,
            reviewedBy: input.reviewedBy ?? "admin",
            reviewedAt: new Date()
          }
        });
        return mapClaim(record);
      }
    },
    commissionLedger: {
      async upsert(input) {
        const record = await prisma.commissionLedger.upsert({
          where: {
            userId_tbkOrderId_ledgerType: {
              userId: input.userId,
              tbkOrderId: input.tbkOrderId,
              ledgerType: input.ledgerType
            }
          },
          create: input,
          update: {
            amountCents: input.amountCents,
            status: input.status,
            reason: input.reason
          }
        });
        return mapLedger(record);
      }
    },
    subscriptions: {
      async addGrant(userId: string, templateId: string) {
        await prisma.subscribeGrant.create({ data: { userId, templateId } });
      },
      async countUnused(userId: string, templateId: string) {
        return prisma.subscribeGrant.count({ where: { userId, templateId, used: false } });
      },
      async listUnusedWithOpenid(templateId: string) {
        const grants = await prisma.subscribeGrant.findMany({
          where: { templateId, used: false },
          orderBy: { createdAt: "asc" },
          include: { user: { select: { openid: true } } }
        });
        // 每个用户只取一条额度
        const seen = new Set<string>();
        return grants
          .filter((grant) => {
            if (seen.has(grant.userId)) return false;
            seen.add(grant.userId);
            return true;
          })
          .map((grant) => ({ grantId: grant.id, userId: grant.userId, openid: grant.user.openid }));
      },
      async markUsed(grantIds: string[]) {
        if (grantIds.length === 0) return;
        await prisma.subscribeGrant.updateMany({
          where: { id: { in: grantIds } },
          data: { used: true, usedAt: new Date() }
        });
      }
    },
    deals: {
      async list(publishedOnly: boolean) {
        const records = await prisma.dealPost.findMany({
          where: publishedOnly ? { status: "published" } : undefined,
          orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }]
        });
        return records.map(mapDeal);
      },
      async findById(id: string) {
        const record = await prisma.dealPost.findUnique({ where: { id } });
        return record ? mapDeal(record) : undefined;
      },
      async create(input) {
        const record = await prisma.dealPost.create({
          data: {
            title: input.title,
            summary: input.summary ?? null,
            status: input.status,
            pinned: input.pinned ?? false,
            steps: toJsonValue(input.steps),
            publishedAt: input.status === "published" ? new Date() : null
          }
        });
        return mapDeal(record);
      },
      async update(id, input) {
        const existing = await prisma.dealPost.findUniqueOrThrow({ where: { id } });
        const record = await prisma.dealPost.update({
          where: { id },
          data: {
            title: input.title,
            summary: input.summary ?? null,
            status: input.status,
            pinned: input.pinned ?? existing.pinned,
            steps: toJsonValue(input.steps),
            publishedAt:
              input.status === "published" && !existing.publishedAt ? new Date() : existing.publishedAt
          }
        });
        return mapDeal(record);
      },
      async remove(id) {
        await prisma.dealPost.delete({ where: { id } });
      }
    },
    checkIns: {
      async findByUserAndDate(userId: string, checkInDate: string) {
        const record = await prisma.checkIn.findUnique({
          where: { userId_checkInDate: { userId, checkInDate } }
        });
        return record ?? undefined;
      },
      async create(input: { userId: string; checkInDate: string; points: number }) {
        return prisma.checkIn.create({ data: input });
      },
      async listRecentDates(userId: string, limit: number) {
        const records = await prisma.checkIn.findMany({
          where: { userId },
          orderBy: { checkInDate: "desc" },
          take: limit,
          select: { checkInDate: true }
        });
        return records.map((record) => record.checkInDate);
      },
      async totalPoints(userId: string) {
        const result = await prisma.checkIn.aggregate({
          where: { userId },
          _sum: { points: true }
        });
        return result._sum.points ?? 0;
      }
    },
    admin: {
      async overview() {
        const [
          userCount,
          conversionCount,
          copyEventCount,
          pendingAttributionCount,
          orderClaimCount
        ] = await Promise.all([
          prisma.user.count(),
          prisma.conversion.count(),
          prisma.copyEvent.count(),
          prisma.orderAttribution.count({ where: { status: { in: ["pending_review", "unmatched"] } } }),
          prisma.orderClaim.count()
        ]);

        return {
          userCount,
          conversionCount,
          copyEventCount,
          pendingAttributionCount,
          orderClaimCount
        };
      }
    }
  };
}

function mapUser(user: {
  id: string;
  openid: string;
  unionid: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  status: string;
  createdAt: Date;
}): UserRecord {
  return {
    id: user.id,
    openid: user.openid,
    unionid: user.unionid,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    status: user.status,
    createdAt: user.createdAt
  };
}

function mapConversion(record: {
  id: string;
  userId: string;
  rawContent: string;
  platform: string;
  itemId: string;
  itemTitle: string;
  itemImageUrl: string | null;
  itemPriceCents: number | null;
  commissionRate: number | null;
  estimatedCommissionCents: number;
  estimatedRebateCents: number;
  generatedPassword: string;
  generatedShortUrl: string;
  generatedClickUrl: string;
  createdAt: Date;
}): ConversionRecord {
  return {
    ...record,
    platform: record.platform as ConversionRecord["platform"],
    itemImageUrl: record.itemImageUrl ?? "",
    itemPriceCents: record.itemPriceCents ?? 0,
    commissionRate: record.commissionRate ?? 0
  };
}

function mapCopyEvent(record: {
  id: string;
  conversionId: string;
  userId: string;
  itemId: string;
  copyType: string;
  copiedAt: Date;
}): CopyEventRecord {
  return {
    ...record,
    copyType: record.copyType as CopyEventRecord["copyType"]
  };
}

function mapOrder(record: {
  id: string;
  tbkOrderId: string;
  itemId: string;
  itemTitle: string;
  payTime: Date;
  payAmountCents: number;
  estimatedCommissionCents: number;
  settledCommissionCents: number | null;
  orderStatus: string;
  rawPayload: unknown;
}): OrderRecord {
  return record;
}

function mapAttribution(record: {
  id: string;
  tbkOrderId: string;
  userId: string | null;
  conversionId: string | null;
  copyEventId: string | null;
  status: string;
  confidence: number;
  reason: string;
  createdAt: Date;
}): AttributionRecord {
  return record;
}

function mapLedger(record: {
  id: string;
  userId: string;
  tbkOrderId: string;
  amountCents: number;
  ledgerType: string;
  status: string;
  reason: string;
  createdAt: Date;
}): CommissionLedgerRecord {
  return record;
}

function mapClaim(record: {
  id: string;
  userId: string;
  orderSuffix: string;
  screenshotUrl: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
}): OrderClaimRecord {
  return record;
}

function mapDeal(record: {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  pinned: boolean;
  steps: unknown;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): DealPostRecord {
  return {
    ...record,
    steps: Array.isArray(record.steps) ? (record.steps as DealPostRecord["steps"]) : []
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}
