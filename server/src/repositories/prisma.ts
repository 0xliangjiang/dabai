import { Prisma, PrismaClient } from "@prisma/client";
import { resolveEffectiveStatus } from "../domain/order-status.js";
import { titleMatches } from "../domain/attribution.js";
import type {
  AdminUserRecord,
  AdminWithdrawalRecord,
  AttributionRecord,
  DealPostRecord,
  CommissionLedgerRecord,
  ConversionRecord,
  CopyEventRecord,
  DownlineRecord,
  OrderClaimRecord,
  OrderRecord,
  ReferralSummary,
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

export function createPrismaRepositories(databaseUrl?: string): Repositories {
  const prisma = databaseUrl ? new PrismaClient({ datasourceUrl: databaseUrl }) : new PrismaClient();
  return {
    users: {
      async findOrCreateByOpenid(
        openid: string,
        input: { unionid?: string | null; inviterId?: string | null } = {}
      ) {
        // 二级分销绑定只在「新用户首次注册」时生效：放进 create 分支，update 不动。
        // 先校验邀请人存在且未软删，无效则置 null（避免 FK 报错导致登录失败）。
        let inviterId: string | null = null;
        let alreadyExisted = false;
        if (input.inviterId) {
          const inviter = await prisma.user.findUnique({ where: { id: input.inviterId } });
          if (inviter && !inviter.deletedAt) inviterId = inviter.id;
          // 仅在「被邀请进来」的登录上多查一次，用于判断是不是真·新用户绑定（打日志用）
          alreadyExisted = Boolean(await prisma.user.findUnique({ where: { openid }, select: { id: true } }));
        }
        // 软删除用户重新登录时复活账号（清除 deletedAt），保留历史数据
        const user = await prisma.user.upsert({
          where: { openid },
          create: { openid, unionid: input.unionid ?? null, inviterId },
          update: {
            ...(input.unionid ? { unionid: input.unionid } : {}),
            deletedAt: null
          }
        });
        // 绑定埋点：新用户 + 成功绑上线时记一条，方便核对朋友圈/好友拉新
        if (inviterId && !alreadyExisted) {
          console.log(`[referral-bind] 新用户 ${user.id} 绑定到上线 ${inviterId}`);
        }
        return mapUser(user);
      },
      async findById(id: string) {
        const user = await prisma.user.findUnique({ where: { id } });
        // 软删除用户视为不存在
        return user && !user.deletedAt ? mapUser(user) : undefined;
      },
      async getOrReviveById(id: string) {
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) return undefined;
        if (user.deletedAt) {
          // 删除后又回来用 app 的用户：自动复活，重新可被后台管理
          const revived = await prisma.user.update({ where: { id }, data: { deletedAt: null } });
          return mapUser(revived);
        }
        return mapUser(user);
      },
      async referralSummary(userId: string): Promise<ReferralSummary> {
        const [downlineCount, earned, pending] = await Promise.all([
          prisma.user.count({ where: { inviterId: userId, deletedAt: null } }),
          prisma.commissionLedger.aggregate({
            where: { userId, status: "available", ledgerType: { startsWith: "referral_" } },
            _sum: { amountCents: true }
          }),
          prisma.commissionLedger.aggregate({
            where: { userId, status: "pending", ledgerType: { startsWith: "referral_" } },
            _sum: { amountCents: true }
          })
        ]);
        return {
          downlineCount,
          earnedCents: earned._sum.amountCents ?? 0,
          pendingCents: pending._sum.amountCents ?? 0
        };
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
      async list(options?: { page?: number; pageSize?: number; search?: string }) {
        const pageSize = Math.min(200, Math.max(1, options?.pageSize ?? 50));
        const page = Math.max(1, options?.page ?? 1);
        const search = options?.search?.trim();
        const where: Prisma.UserWhereInput = {
          deletedAt: null,
          ...(search
            ? { OR: [{ nickname: { contains: search } }, { openid: { contains: search } }, { id: { contains: search } }] }
            : {})
        };
        const [total, users] = await Promise.all([
          prisma.user.count({ where }),
          prisma.user.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
              inviter: { select: { nickname: true } },
              _count: {
                select: {
                  conversions: true,
                  copyEvents: true,
                  orderClaims: true,
                  invitees: { where: { deletedAt: null } }
                }
              }
            }
          })
        ]);

        return {
          total,
          items: users.map((user) => ({
            ...mapUser(user),
            conversionCount: user._count.conversions,
            copyEventCount: user._count.copyEvents,
            claimCount: user._count.orderClaims,
            inviterNickname: user.inviter?.nickname ?? null,
            downlineCount: user._count.invitees
          }))
        };
      },
      async listDownline(inviterId: string): Promise<DownlineRecord[]> {
        const downlines = await prisma.user.findMany({
          where: { inviterId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: { id: true, nickname: true, openid: true, createdAt: true }
        });
        if (downlines.length === 0) return [];

        // 上级的二级提成台账（referral_*），经 订单→归因 关联到具体下线，按下线累加
        const entries = await prisma.commissionLedger.findMany({
          where: { userId: inviterId, ledgerType: { startsWith: "referral_" } },
          select: {
            amountCents: true,
            tbkOrder: { select: { attribution: { select: { userId: true } } } }
          }
        });
        const contributedByUser = new Map<string, number>();
        for (const entry of entries) {
          const downlineId = entry.tbkOrder?.attribution?.userId;
          if (!downlineId) continue;
          contributedByUser.set(downlineId, (contributedByUser.get(downlineId) ?? 0) + entry.amountCents);
        }

        return downlines.map((d) => ({
          id: d.id,
          nickname: d.nickname,
          openid: d.openid,
          createdAt: d.createdAt,
          contributedCents: contributedByUser.get(d.id) ?? 0
        }));
      },
      async deleteUser(id: string) {
        // 软删除：仅标记 deletedAt，保留订单、佣金等历史数据，便于复盘与防误删
        await prisma.user.update({
          where: { id },
          data: { deletedAt: new Date() }
        });
      },
      async adjustPoints(id: string, input: { delta: number; reason: string }) {
        await prisma.pointAdjustment.create({
          data: {
            userId: id,
            amountCents: input.delta,
            reason: input.reason,
            createdBy: "admin"
          }
        });
      },
      async setRebateRatio(id: string, ratio: number | null) {
        const user = await prisma.user.update({ where: { id }, data: { rebateRatio: ratio } });
        return mapUser(user);
      }
    },
    settings: {
      async getCommissionSharingRatio() {
        const row = await prisma.setting.findUnique({ where: { key: COMMISSION_RATIO_KEY } });
        if (!row) return null;
        const n = Number(row.value);
        return Number.isFinite(n) ? n : null;
      },
      async setCommissionSharingRatio(ratio: number) {
        await prisma.setting.upsert({
          where: { key: COMMISSION_RATIO_KEY },
          create: { key: COMMISSION_RATIO_KEY, value: String(ratio) },
          update: { value: String(ratio) }
        });
      },
      async getExchangeEnabled() {
        const row = await prisma.setting.findUnique({ where: { key: EXCHANGE_ENABLED_KEY } });
        // 默认关闭：未配置时隐藏兑换入口，对审核安全
        return row?.value === "1";
      },
      async setExchangeEnabled(enabled: boolean) {
        await prisma.setting.upsert({
          where: { key: EXCHANGE_ENABLED_KEY },
          create: { key: EXCHANGE_ENABLED_KEY, value: enabled ? "1" : "0" },
          update: { value: enabled ? "1" : "0" }
        });
      },
      async getReferralRatio() {
        const row = await prisma.setting.findUnique({ where: { key: REFERRAL_RATIO_KEY } });
        if (!row) return null;
        const n = Number(row.value);
        return Number.isFinite(n) ? n : null;
      },
      async setReferralRatio(ratio: number) {
        await prisma.setting.upsert({
          where: { key: REFERRAL_RATIO_KEY },
          create: { key: REFERRAL_RATIO_KEY, value: String(ratio) },
          update: { value: String(ratio) }
        });
      },
      async getReferralEnabled() {
        const row = await prisma.setting.findUnique({ where: { key: REFERRAL_ENABLED_KEY } });
        // 默认关闭：配好比例后再手动开
        return row?.value === "1";
      },
      async setReferralEnabled(enabled: boolean) {
        await prisma.setting.upsert({
          where: { key: REFERRAL_ENABLED_KEY },
          create: { key: REFERRAL_ENABLED_KEY, value: enabled ? "1" : "0" },
          update: { value: enabled ? "1" : "0" }
        });
      },
      async getOverrides() {
        const rows = await prisma.setting.findMany();
        return Object.fromEntries(rows.map((r) => [r.key, r.value]));
      },
      async setMany(entries: Array<{ key: string; value: string }>) {
        await prisma.$transaction(
          entries.map((e) =>
            prisma.setting.upsert({
              where: { key: e.key },
              create: { key: e.key, value: e.value },
              update: { value: e.value }
            })
          )
        );
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
          orderBy: { createdAt: "desc" },
          take: 200 // 仅展示最近 200 条，避免重度用户拉取过大
        });
        return records.map(mapConversion);
      },
      async listByItem(itemId: string) {
        const records = await prisma.conversion.findMany({
          where: { itemId },
          orderBy: { createdAt: "desc" },
          // 归因只看最近的候选（窗口内+最近一条窗外回退都在最新里），封顶避免热门商品每单 load 海量历史
          take: 1000
        });
        return records.map(mapConversion);
      },
      async listByTitle(title: string) {
        const t = title.trim();
        if (t.length < 8) return []; // 标题太短不做匹配，避免通用词误判
        // 用前 10 字粗筛，再在内存里做前缀判断（转化标题常被折淘客截断成订单标题的前缀）
        const probe = t.slice(0, 10);
        const records = await prisma.conversion.findMany({
          where: { itemTitle: { contains: probe } },
          orderBy: { createdAt: "desc" },
          take: 1000
        });
        return records.map(mapConversion).filter((c) => titleMatches(t, c.itemTitle));
      },
      async listForAdmin(options) {
        const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 50));
        const page = Math.max(1, options?.page ?? 1);
        const search = options?.search?.trim();
        const where: Prisma.ConversionWhereInput = search
          ? {
              OR: [
                { itemTitle: { contains: search } },
                { itemId: { contains: search } },
                { user: { is: { nickname: { contains: search } } } },
                { user: { is: { openid: { contains: search } } } }
              ]
            }
          : {};
        const [total, records] = await Promise.all([
          prisma.conversion.count({ where }),
          prisma.conversion.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { user: { select: { nickname: true, openid: true } } }
          })
        ]);
        return {
          total,
          items: records.map((record) => ({
            id: record.id,
            userId: record.userId,
            userNickname: record.user?.nickname ?? null,
            userOpenid: record.user?.openid ?? "",
            itemId: record.itemId,
            itemTitle: record.itemTitle,
            platform: record.platform,
            estimatedRebateCents: record.estimatedRebateCents,
            createdAt: record.createdAt
          }))
        };
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
          orderBy: { copiedAt: "desc" },
          // 同上：归因只需最近候选，封顶避免热门商品每单 load 海量复制事件
          take: 1000
        });
        return records.map(mapCopyEvent);
      }
    },
    orders: {
      async listByUser(userId: string) {
        const records = await prisma.orderAttribution.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          include: { tbkOrder: true }
        });
        if (records.length === 0) return [];

        // 一次性取这些订单的台账（避免 N+1 把用户全部台账 load 进内存）；
        // 排除 reversed，使退款订单返利显示为 0。
        const orderIds = records.map((r) => r.tbkOrderId);
        const ledgers = await prisma.commissionLedger.findMany({
          where: { userId, tbkOrderId: { in: orderIds }, status: { not: "reversed" } },
          select: { tbkOrderId: true, amountCents: true }
        });
        const rebateByOrder = new Map<string, number>();
        for (const l of ledgers) {
          rebateByOrder.set(l.tbkOrderId, (rebateByOrder.get(l.tbkOrderId) ?? 0) + l.amountCents);
        }

        return records.map((record) => ({
          id: record.tbkOrder.id,
          itemTitle: record.tbkOrder.itemTitle,
          status: record.tbkOrder.orderStatus,
          payTime: record.tbkOrder.payTime,
          payAmountCents: record.tbkOrder.payAmountCents,
          estimatedCommissionCents: record.tbkOrder.estimatedCommissionCents,
          settledCommissionCents: record.tbkOrder.settledCommissionCents,
          userRebateCents: rebateByOrder.get(record.tbkOrderId) ?? 0
        }));
      },
      async upsert(input: UpsertOrderInput) {
        const existing = await prisma.tbkOrder.findUnique({ where: { tbkOrderId: input.tbkOrderId } });
        // 手动标记的状态与折淘客状态取更靠后者，避免同步把已收货/已结算刷回已付款
        const orderStatus = resolveEffectiveStatus(input.orderStatus, existing?.manualStatus ?? null);
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
            orderStatus,
            rawPayload: toJsonValue(input.rawPayload)
          },
          update: {
            itemId: input.itemId,
            itemTitle: input.itemTitle,
            payTime: input.payTime,
            payAmountCents: input.payAmountCents,
            estimatedCommissionCents: input.estimatedCommissionCents,
            settledCommissionCents: input.settledCommissionCents,
            orderStatus,
            rawPayload: toJsonValue(input.rawPayload),
            syncedAt: new Date()
          }
        });
        return mapOrder(record);
      },
      async markOrderStatus(id: string, status: string) {
        const record = await prisma.tbkOrder.update({
          where: { id },
          data: { manualStatus: status, orderStatus: status }
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
      async getAttribution(tbkOrderId: string) {
        const order = await prisma.tbkOrder.findUnique({ where: { tbkOrderId } });
        if (!order) return null;
        const attribution = await prisma.orderAttribution.findUnique({ where: { tbkOrderId: order.id } });
        return attribution ? { status: attribution.status, userId: attribution.userId } : null;
      },
      async listPendingAttributions() {
        const records = await prisma.orderAttribution.findMany({
          where: { status: { in: ["pending_review", "unmatched"] } },
          orderBy: { createdAt: "desc" },
          include: { tbkOrder: true },
          take: 500
        });
        return records.map((record) => ({
          ...mapAttribution(record),
          order: mapOrder(record.tbkOrder)
        }));
      },
      async listAllOrders(options?: { page?: number; pageSize?: number; orderStatus?: string; attributionStatus?: string }) {
        const page = Math.max(1, options?.page ?? 1);
        const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 50));
        const skip = (page - 1) * pageSize;

        const where = {
          ...(options?.orderStatus ? { orderStatus: options.orderStatus } : {}),
          ...(options?.attributionStatus
            ? { attribution: { status: options.attributionStatus } }
            : {})
        };

        const [total, records] = await Promise.all([
          prisma.tbkOrder.count({ where }),
          prisma.tbkOrder.findMany({
            where,
            orderBy: { payTime: "desc" },
            skip,
            take: pageSize,
            include: { attribution: { include: { user: { select: { nickname: true } } } } }
          })
        ]);

        return {
          total,
          items: records.map((r) => ({
            ...mapOrder(r),
            attribution: r.attribution
              ? {
                  ...mapAttribution(r.attribution),
                  userNickname: r.attribution.user?.nickname ?? null
                }
              : null
          }))
        };
      },
      async findByOrderNumber(orderNumber: string) {
        const suffix = orderNumber.trim();
        // tbkOrderId 精确匹配或后缀匹配；京东原始订单号走 rawPayload 单独查一次
        let tbkOrder = await prisma.tbkOrder.findFirst({
          where: { OR: [{ tbkOrderId: suffix }, { tbkOrderId: { endsWith: suffix } }] },
          orderBy: { syncedAt: "desc" }
        });
        if (!tbkOrder && isNumeric(suffix)) {
          // MySQL JSON_EXTRACT 通过 rawQuery 匹配京东 orderId 字段
          const rows = await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM TbkOrder
            WHERE JSON_EXTRACT(rawPayload, '$.orderId') = ${Number(suffix)}
               OR JSON_EXTRACT(rawPayload, '$.trade_id') = ${suffix}
            LIMIT 1`;
          if (rows.length > 0) {
            tbkOrder = await prisma.tbkOrder.findUnique({ where: { id: rows[0].id } });
          }
        }
        if (!tbkOrder) return undefined;
        const attribution = await prisma.orderAttribution.findUnique({ where: { tbkOrderId: tbkOrder.id } });
        return {
          order: mapOrder(tbkOrder),
          attribution: attribution ? mapAttribution(attribution) : null
        };
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
          include: { user: { select: { openid: true } } },
          take: 500
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
      },
      async reverseOrder(userId: string, tbkOrderId: string) {
        await prisma.commissionLedger.updateMany({
          where: { userId, tbkOrderId },
          data: { status: "reversed" }
        });
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
          orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
          include: { _count: { select: { visits: true } } }
        });
        return records.map(mapDeal);
      },
      async findById(id: string) {
        const record = await prisma.dealPost.findUnique({
          where: { id },
          include: { _count: { select: { visits: true } } }
        });
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
      },
      async recordView(id: string, visitorKey: string) {
        // PV：每次访问 +1；UV：按 (dealId, visitorKey) 去重
        await prisma.$transaction([
          prisma.dealPost.update({ where: { id }, data: { viewCount: { increment: 1 } } }),
          prisma.dealVisit.upsert({
            where: { dealId_visitorKey: { dealId: id, visitorKey } },
            create: { dealId: id, visitorKey },
            update: {}
          })
        ]);
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
    withdrawals: {
      async create(input) {
        const record = await prisma.withdrawal.create({
          data: {
            userId: input.userId,
            amountCents: input.amountCents,
            payAccount: input.payAccount,
            payType: input.payType,
            notes: input.notes ?? null
          }
        });
        return mapWithdrawal(record);
      },
      async listByUser(userId: string) {
        const records = await prisma.withdrawal.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" }
        });
        return records.map(mapWithdrawal);
      },
      async createIfAffordable(input) {
        // Serializable 事务：余额计算 + 创建在同一事务内，并发提交会被串行化，杜绝超额
        return prisma.$transaction(
          async (tx) => {
            const [earned, points, adjustment, requested] = await Promise.all([
              tx.commissionLedger.aggregate({
                where: { userId: input.userId, status: "available" },
                _sum: { amountCents: true }
              }),
              tx.checkIn.aggregate({ where: { userId: input.userId }, _sum: { points: true } }),
              tx.pointAdjustment.aggregate({ where: { userId: input.userId }, _sum: { amountCents: true } }),
              tx.withdrawal.aggregate({
                where: { userId: input.userId, status: { in: ["pending", "paid"] } },
                _sum: { amountCents: true }
              })
            ]);
            const total =
              (earned._sum.amountCents ?? 0) +
              (points._sum.points ?? 0) +
              (adjustment._sum.amountCents ?? 0);
            const available = Math.max(0, total - (requested._sum.amountCents ?? 0));
            if (input.amountCents > available) {
              return { ok: false as const, available };
            }
            const record = await tx.withdrawal.create({
              data: {
                userId: input.userId,
                amountCents: input.amountCents,
                payAccount: "",
                payType: "redpacket",
                notes: null
              }
            });
            return { ok: true as const, withdrawal: mapWithdrawal(record) };
          },
          { isolationLevel: "Serializable" }
        );
      },
      async getAvailableBalance(userId: string) {
        const [earned, points, adjustment, requestedResult] = await Promise.all([
          prisma.commissionLedger.aggregate({
            where: { userId, status: "available" },
            _sum: { amountCents: true }
          }),
          prisma.checkIn.aggregate({
            where: { userId },
            _sum: { points: true }
          }),
          prisma.pointAdjustment.aggregate({
            where: { userId },
            _sum: { amountCents: true }
          }),
          prisma.withdrawal.aggregate({
            where: { userId, status: { in: ["pending", "paid"] } },
            _sum: { amountCents: true }
          })
        ]);
        // 100积分=1元，即 1积分=1分；签到积分、推广佣金、管理员调整合并为可兑换余额
        const total =
          (earned._sum.amountCents ?? 0) +
          (points._sum.points ?? 0) +
          (adjustment._sum.amountCents ?? 0);
        const requested = requestedResult._sum.amountCents ?? 0;
        return Math.max(0, total - requested);
      },
      async list(status?: string) {
        const records = await prisma.withdrawal.findMany({
          where: status ? { status } : undefined,
          orderBy: { createdAt: "desc" },
          include: { user: { select: { openid: true, nickname: true } } },
          take: 500
        });
        return records.map((record): AdminWithdrawalRecord => ({
          ...mapWithdrawal(record),
          userNickname: record.user.nickname,
          userOpenid: record.user.openid
        }));
      },
      async review(id: string, input: { status: "paid" | "rejected"; reviewedBy?: string; notes?: string | null }) {
        const record = await prisma.withdrawal.update({
          where: { id },
          data: {
            status: input.status,
            reviewedBy: input.reviewedBy ?? "admin",
            reviewedAt: new Date(),
            ...(input.notes !== undefined ? { notes: input.notes } : {})
          }
        });
        return mapWithdrawal(record);
      }
    },
    syncRuns: {
      async record(input) {
        await prisma.orderSyncRun.create({ data: input });
      },
      async getLatest() {
        const record = await prisma.orderSyncRun.findFirst({ orderBy: { createdAt: "desc" } });
        return record ?? null;
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
  rebateRatio: number | null;
  inviterId: string | null;
  createdAt: Date;
}): UserRecord {
  return {
    id: user.id,
    openid: user.openid,
    unionid: user.unionid,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    status: user.status,
    rebateRatio: user.rebateRatio,
    inviterId: user.inviterId,
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
  manualStatus?: string | null;
  rawPayload: unknown;
}): OrderRecord {
  return { ...record, manualStatus: record.manualStatus ?? null };
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
  viewCount?: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { visits: number };
}): DealPostRecord {
  return {
    id: record.id,
    title: record.title,
    summary: record.summary,
    status: record.status,
    pinned: record.pinned,
    steps: Array.isArray(record.steps) ? (record.steps as DealPostRecord["steps"]) : [],
    viewCount: record.viewCount ?? 0,
    visitorCount: record._count?.visits ?? 0,
    publishedAt: record.publishedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function mapWithdrawal(record: {
  id: string;
  userId: string;
  amountCents: number;
  status: string;
  payAccount: string;
  payType: string;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): WithdrawalRecord {
  return record;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function isNumeric(value: string): boolean {
  return /^\d+$/.test(value);
}
