import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import type { Repositories } from "../repositories/types.js";
import type { DealPublishedNotifier } from "../domain/deal-notify.js";
import { resolveDealCopyValue } from "../domain/deal-link-resolver.js";
import { getEffectiveConfig, buildSettingsView, isValidSettingKey, SETTING_FIELDS } from "../config/runtime.js";
import { buildCommissionLedgerEntry, buildReferralLedgerEntry, resolveSharingRatio } from "../domain/commission.js";
import { reattributePendingOrders, reconcileOrderLedger, resolveCommissionOptions } from "../domain/order-sync.js";
import { createDealAiParser, MinimaxError } from "../integrations/minimax/client.js";
import { registerAdminDealRoutes } from "./deals.js";
import { handleMediaUpload } from "./uploads.js";
import { centsToPoints } from "../domain/points.js";

export async function registerAdminRoutes(
  app: FastifyInstance,
  config: AppConfig,
  repositories: Repositories,
  uploadDir: string,
  notifyDealPublished?: DealPublishedNotifier
) {
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/admin")) {
      return;
    }

    if (request.headers["x-admin-token"] !== config.adminToken) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/api/admin/overview", async () => ({
    metrics: await repositories.admin.overview()
  }));

  // 最近一次订单同步状态：含生效同步间隔，供前端判断「太久没跑」
  app.get("/api/admin/sync-status", async () => {
    const cfg = await getEffectiveConfig(config, repositories);
    const interval = cfg.orderSyncIntervalMinutes > 0 ? cfg.orderSyncIntervalMinutes : 15;
    return {
      latest: await repositories.syncRuns.getLatest(),
      intervalMinutes: interval
    };
  });

  app.get<{
    Querystring: {
      page?: string;
      pageSize?: string;
      search?: string;
      status?: string;
      relation?: string;
      sort?: string;
    };
  }>(
    "/api/admin/users",
    async (request) => {
      const page = request.query.page ? Number(request.query.page) : 1;
      const pageSize = request.query.pageSize ? Number(request.query.pageSize) : 50;
      const status =
        request.query.status === "active" || request.query.status === "banned"
          ? request.query.status
          : undefined;
      const relation =
        request.query.relation === "has_downline" ||
        request.query.relation === "has_inviter" ||
        request.query.relation === "no_inviter"
          ? request.query.relation
          : undefined;
      const sort =
        request.query.sort === "oldest" || request.query.sort === "downline_desc"
          ? request.query.sort
          : "newest";
      const { total, items } = await repositories.users.list({
        page,
        pageSize,
        search: request.query.search,
        status,
        relation,
        sort
      });
      return { users: items, total, page, pageSize };
    }
  );

  app.get<{
    Params: { id: string };
    Querystring: { orderPage?: string; downlinePage?: string; pageSize?: string };
  }>("/api/admin/users/:id/detail", async (request, reply) => {
    const user = await repositories.users.findById(request.params.id);
    if (!user) {
      return reply.code(404).send({ error: "用户不存在" });
    }

    const orderPage = positivePage(request.query.orderPage);
    const downlinePage = positivePage(request.query.downlinePage);
    const pageSize = Math.min(50, Math.max(1, Number(request.query.pageSize) || 20));
    const [inviter, availableCents, rebateTotals, referral, orders, downlines, withdrawals] =
      await Promise.all([
        user.inviterId ? repositories.users.findById(user.inviterId) : Promise.resolve(undefined),
        repositories.withdrawals.getAvailableBalance(user.id),
        repositories.orders.getRebateTotals(user.id),
        repositories.users.referralSummary(user.id),
        repositories.orders.listByUser(user.id, { page: orderPage, pageSize }),
        repositories.users.listDownline(user.id, { page: downlinePage, pageSize }),
        repositories.withdrawals.listByUser(user.id, { page: 1, pageSize: 20 })
      ]);

    return {
      user: {
        ...user,
        inviter: inviter
          ? { id: inviter.id, nickname: inviter.nickname, openid: inviter.openid }
          : null
      },
      balance: {
        availableCents,
        availableRewardValue: centsToPoints(availableCents),
        settledCents: rebateTotals.settledPoints,
        settledRewardValue: centsToPoints(rebateTotals.settledPoints),
        pendingCents: rebateTotals.pendingPoints,
        pendingRewardValue: centsToPoints(rebateTotals.pendingPoints)
      },
      referral: {
        ...referral,
        earnedRewardValue: centsToPoints(referral.earnedCents),
        pendingRewardValue: centsToPoints(referral.pendingCents)
      },
      orders: {
        ...orders,
        page: orderPage,
        pageSize,
        hasMore: orderPage * pageSize < orders.total
      },
      downlines: {
        ...downlines,
        page: downlinePage,
        pageSize,
        hasMore: downlinePage * pageSize < downlines.total
      },
      withdrawals: {
        ...withdrawals,
        page: 1,
        pageSize: 20,
        hasMore: withdrawals.total > withdrawals.items.length
      }
    };
  });

  // 某会员的下线明细（昵称、加入时间、累计为上级贡献的提成）
  app.get<{ Params: { id: string } }>("/api/admin/users/:id/downline", async (request) => {
    const { total, items } = await repositories.users.listDownline(request.params.id, { page: 1, pageSize: 100 });
    return { downlines: items, total };
  });

  // 查询历史：按 商品标题/itemId/用户昵称 搜索转化记录，用于人工归因兜底
  app.get<{ Querystring: { search?: string; platform?: string; page?: string; pageSize?: string } }>(
    "/api/admin/conversions",
    async (request) => {
      const { total, items } = await repositories.conversions.listForAdmin({
        search: request.query.search,
        platform: request.query.platform,
        page: request.query.page ? Number(request.query.page) : 1,
        pageSize: request.query.pageSize ? Number(request.query.pageSize) : 50
      });
      return { conversions: items, total };
    }
  );

  app.post<{ Body: { rawContent?: string } }>(
    "/api/admin/deals/ai-parse",
    async (request, reply) => {
      try {
        // 用最新生效配置构建 AI 解析与转链客户端
        const cfg = await getEffectiveConfig(config, repositories);
        const dealAiParser = createDealAiParser({
          apiUrl: cfg.minimaxApiUrl,
          apiKey: cfg.minimaxApiKey,
          model: cfg.minimaxModel
        });
        const taobaoClient = await app.deps.buildTaobaoClient();
        const deal = await dealAiParser.parseDealFromText(request.body?.rawContent ?? "");
        // 把识别到的淘口令/链接转成自己的（口令+链接），免手动再转一遍
        let convertedCount = 0;
        for (const step of deal.steps) {
          const original = (step.copyValue ?? "").trim();
          if (!original || (step.copyType !== "password" && step.copyType !== "link")) continue;
          try {
            const normalized = await resolveDealCopyValue(original);
            const r = await taobaoClient.convert(normalized);
            const link = r.generatedShortUrl || r.generatedClickUrl;
            const combined = [r.generatedPassword, link].filter(Boolean).join(" ").trim();
            if (combined) {
              step.copyValue = combined;
              step.copyType = "password";
              convertedCount += 1;
            }
          } catch {
            // 转链失败（非淘宝商品、无券、平台未开通等）保留原内容
          }
        }
        return { deal, convertedCount };
      } catch (error) {
        if (error instanceof MinimaxError) {
          return reply.code(400).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  // 运营设置：非密钥回显当前值，密钥只给「是否已配置」
  app.get("/api/admin/settings", async () => {
    const overrides = await repositories.settings.getOverrides();
    return { settings: buildSettingsView(config, overrides) };
  });

  app.post<{ Body: { entries?: Array<{ key: string; value: string }> } }>(
    "/api/admin/settings",
    async (request, reply) => {
      const entries = (request.body?.entries ?? []).filter(
        (e) => e && typeof e.key === "string" && typeof e.value === "string" && isValidSettingKey(e.key)
      );
      // 密钥项留空表示「不修改」，过滤掉；非密钥留空表示「清空回落 env」，保留
      const secretKeys = new Set(SETTING_FIELDS.filter((m) => m.secret).map((m) => m.key));
      const toSave = entries.filter((e) => !(secretKeys.has(e.key) && e.value.trim() === ""));
      if (toSave.length > 0) {
        await repositories.settings.setMany(toSave.map((e) => ({ key: e.key, value: e.value.trim() })));
      }
      return { ok: true, saved: toSave.length };
    }
  );

  app.get("/api/admin/config", async () => {
    const [dbRatio, exchangeEnabled, referralRatio, referralEnabled, ordersTabEnabled] = await Promise.all([
      repositories.settings.getCommissionSharingRatio(),
      repositories.settings.getExchangeEnabled(),
      repositories.settings.getReferralRatio(),
      repositories.settings.getReferralEnabled(),
      repositories.settings.getOrdersTabEnabled()
    ]);
    return {
      config: {
        zhetaokePid: config.zhetaokePid,
        commissionSharingRatio: dbRatio ?? config.commissionSharingRatio,
        attributionWindowHours: 24,
        highValueReviewThresholdCents: 5000,
        exchangeEnabled,
        referralCommissionRatio: referralRatio ?? config.referralCommissionRatio,
        referralEnabled,
        ordersTabEnabled
      }
    };
  });

  app.post<{ Body: { enabled?: boolean } }>(
    "/api/admin/config/exchange-enabled",
    async (request, reply) => {
      const enabled = request.body?.enabled;
      if (typeof enabled !== "boolean") {
        return reply.code(400).send({ error: "enabled 必须为 true/false" });
      }
      await repositories.settings.setExchangeEnabled(enabled);
      return { ok: true, exchangeEnabled: enabled };
    }
  );

  app.post<{ Body: { enabled?: boolean } }>(
    "/api/admin/config/orders-tab-enabled",
    async (request, reply) => {
      const enabled = request.body?.enabled;
      if (typeof enabled !== "boolean") {
        return reply.code(400).send({ error: "enabled 必须为 true/false" });
      }
      await repositories.settings.setOrdersTabEnabled(enabled);
      return { ok: true, ordersTabEnabled: enabled };
    }
  );

  app.post<{ Body: { commissionSharingRatio?: number } }>(
    "/api/admin/config/commission-ratio",
    async (request, reply) => {
      const ratio = request.body?.commissionSharingRatio;
      if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
        return reply.code(400).send({ error: "比例需为 0~1 之间的数字" });
      }
      await repositories.settings.setCommissionSharingRatio(ratio);
      return { ok: true, commissionSharingRatio: ratio };
    }
  );

  app.post<{ Body: { referralCommissionRatio?: number } }>(
    "/api/admin/config/referral-ratio",
    async (request, reply) => {
      const ratio = request.body?.referralCommissionRatio;
      if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
        return reply.code(400).send({ error: "比例需为 0~1 之间的数字" });
      }
      await repositories.settings.setReferralRatio(ratio);
      return { ok: true, referralCommissionRatio: ratio };
    }
  );

  app.post<{ Body: { enabled?: boolean } }>(
    "/api/admin/config/referral-enabled",
    async (request, reply) => {
      const enabled = request.body?.enabled;
      if (typeof enabled !== "boolean") {
        return reply.code(400).send({ error: "enabled 必须为 true/false" });
      }
      await repositories.settings.setReferralEnabled(enabled);
      return { ok: true, referralEnabled: enabled };
    }
  );

  app.post<{ Params: { id: string }; Body: { ratio?: number | null } }>(
    "/api/admin/users/:id/rebate-ratio",
    async (request, reply) => {
      const ratio = request.body?.ratio;
      if (ratio !== null && (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0 || ratio > 1)) {
        return reply.code(400).send({ error: "比例需为 0~1 之间的数字，或留空表示用全局" });
      }
      const user = await repositories.users.setRebateRatio(request.params.id, ratio ?? null);
      return { ok: true, user };
    }
  );

  app.get<{ Querystring: {
    page?: string;
    pageSize?: string;
    search?: string;
    orderStatus?: string;
    attributionStatus?: string;
  } }>(
    "/api/admin/orders",
    async (request) => {
      return repositories.orders.listAllOrders({
        page: request.query.page ? Number(request.query.page) : 1,
        pageSize: request.query.pageSize ? Number(request.query.pageSize) : 50,
        search: request.query.search,
        orderStatus: request.query.orderStatus,
        attributionStatus: request.query.attributionStatus
      });
    }
  );

  app.get("/api/admin/pending-attributions", async () => {
    return {
      items: await repositories.orders.listPendingAttributions()
    };
  });

  app.post<{ Params: { id: string }; Body: { userId?: string } }>(
    "/api/admin/orders/:id/attribute",
    async (request, reply) => {
      const userId = request.body?.userId?.trim();
      if (!userId) {
        return reply.code(400).send({ error: "userId is required" });
      }
      const attribution = await repositories.orders.attributeOrder(request.params.id, {
        userId,
        reviewedBy: "admin"
      });
      const order = await repositories.orders.findById(attribution.tbkOrderId);
      if (!order) {
        return reply.code(404).send({ error: "order not found" });
      }
      const options = await resolveCommissionOptions(repositories, config);
      const rebate = await reconcileOrderLedger(repositories, order, options);
      return { attribution, rebate };
    }
  );

  app.post<{ Params: { id: string }; Body: { status?: string } }>(
    "/api/admin/orders/:id/status",
    async (request, reply) => {
      const status = request.body?.status;
      if (!["paid", "received", "settled", "refunded"].includes(status ?? "")) {
        return reply.code(400).send({ error: "status 必须为 paid/received/settled/refunded" });
      }
      const order = await repositories.orders.markOrderStatus(request.params.id, status!);

      // 标记结算/退款时，把奖励值流转到归属用户（契合手动履约）
      if (status === "settled" || status === "refunded") {
        const attribution = await repositories.orders.getAttribution(order.tbkOrderId);
        if (attribution?.userId) {
          const user = await repositories.users.findById(attribution.userId);

          // 退款：冲销该订单已记台账（含上线提成），从可用余额剔除
          if (status === "refunded") {
            await repositories.commissionLedger.reverseOrder(attribution.userId, order.id);
            if (user?.inviterId) {
              await repositories.commissionLedger.reverseOrder(user.inviterId, order.id);
            }
          } else {
            const globalRatio =
              (await repositories.settings.getCommissionSharingRatio()) ?? config.commissionSharingRatio;
            const entry = buildCommissionLedgerEntry({
              userId: attribution.userId,
              tbkOrderId: order.id,
              orderStatus: status,
              estimatedCommissionCents: order.estimatedCommissionCents,
              settledCommissionCents: order.settledCommissionCents,
              sharingRatio: resolveSharingRatio(user?.rebateRatio, globalRatio)
            });
            await repositories.commissionLedger.upsert(entry);

            // 二级分销：手动结算时同步上线提成（与订单同步路径一致）
            const referralEnabled = await repositories.settings.getReferralEnabled();
            const referralRatio =
              (await repositories.settings.getReferralRatio()) ?? config.referralCommissionRatio;
            if (referralEnabled && referralRatio > 0 && user?.inviterId) {
              await repositories.commissionLedger.upsert(
                buildReferralLedgerEntry(entry, user.inviterId, referralRatio)
              );
            }
          }
        }
      }

      return { ok: true, order };
    }
  );

  // 一键核对：把"订单已终态(结算/退款/失效)但返利台账仍 pending"的存量订单立即重算入账
  app.post("/api/admin/orders/reconcile-settled", async () => {
    const options = await resolveCommissionOptions(repositories, config);
    const attempted = new Set<string>();
    let fixed = 0;
    // 分批处理直到没有"新"的滞后订单；只统计已处理过的 id，保证收敛与计数准确
    for (let i = 0; i < 50; i++) {
      const stale = await repositories.commissionLedger.listStalePending(200);
      const fresh = stale.filter((o) => !attempted.has(o.id));
      if (fresh.length === 0) break;
      for (const order of fresh) {
        attempted.add(order.id);
        try {
          const result = await reconcileOrderLedger(repositories, order, options);
          if (result.credited) fixed += 1;
        } catch (error) {
          console.error(`[admin-reconcile] 订单 ${order.tbkOrderId} 核对失败:`, (error as Error).message);
        }
      }
    }
    return { ok: true, scanned: attempted.size, fixed };
  });

  // 一键重跑归因：对历史「待复核 / 未归因」订单用当前归因逻辑重新匹配（人工归因不动）
  app.post("/api/admin/orders/reattribute", async () => {
    const options = await resolveCommissionOptions(repositories, config);
    const result = await reattributePendingOrders(repositories, { ...options, attributionWindowHours: 24 });
    return { ok: true, ...result };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/users/:id", async (request, reply) => {
    await repositories.users.deleteUser(request.params.id);
    return reply.code(200).send({ ok: true });
  });

  app.post<{ Params: { id: string }; Body: { delta?: number; reason?: string } }>(
    "/api/admin/users/:id/adjust-points",
    async (request, reply) => {
      const { delta, reason } = request.body ?? {};
      if (!delta || !Number.isInteger(delta)) {
        return reply.code(400).send({ error: "delta 必须为整数" });
      }
      await repositories.users.adjustPoints(request.params.id, {
        delta,
        reason: reason ?? "admin_manual"
      });
      return { ok: true };
    }
  );

  app.post<{ Params: { id: string }; Body: { status?: string } }>(
    "/api/admin/users/:id/status",
    async (request, reply) => {
      const status = request.body?.status;
      if (status !== "active" && status !== "banned") {
        return reply.code(400).send({ error: "status must be active or banned" });
      }
      return repositories.users.updateStatus(request.params.id, status);
    }
  );

  app.get<{ Querystring: { status?: string } }>("/api/admin/claims", async (request) => ({
    claims: await repositories.orders.listClaims(request.query.status)
  }));

  app.get<{ Querystring: { status?: string } }>("/api/admin/withdrawals", async (request) => ({
    withdrawals: await repositories.withdrawals.list(request.query.status)
  }));

  app.post<{ Params: { id: string }; Body: { status?: string; notes?: string } }>(
    "/api/admin/withdrawals/:id/review",
    async (request, reply) => {
      const { status, notes } = request.body ?? {};
      if (status !== "paid" && status !== "rejected") {
        return reply.code(400).send({ error: "status must be paid or rejected" });
      }
      return repositories.withdrawals.review(request.params.id, {
        status,
        reviewedBy: "admin",
        notes: notes ?? null
      });
    }
  );

  await registerAdminDealRoutes(app, repositories, notifyDealPublished);

  // 线报图文素材上传：图片 5MB，视频(mp4) 60MB
  app.post("/api/admin/uploads", (request, reply) =>
    handleMediaUpload(request, reply, uploadDir, undefined, undefined, 60 * 1024 * 1024)
  );

  app.post<{ Params: { id: string }; Body: { status?: string } }>(
    "/api/admin/claims/:id/review",
    async (request, reply) => {
      const status = request.body?.status;
      if (status !== "approved" && status !== "rejected") {
        return reply.code(400).send({ error: "status must be approved or rejected" });
      }
      return repositories.orders.reviewClaim(request.params.id, {
        status,
        reviewedBy: "admin"
      });
    }
  );
}

function positivePage(value?: string): number {
  return Math.max(1, Number(value) || 1);
}
