import type { FastifyInstance } from "fastify";
import type { Repositories } from "../repositories/types.js";
import { centsToPoints, pointsToCents } from "../domain/points.js";

const MIN_WITHDRAWAL_CENTS = 1000; // ¥10 minimum

export async function registerWithdrawalRoutes(app: FastifyInstance, repositories: Repositories) {
  app.get<{ Querystring: { page?: string; pageSize?: string } }>("/api/withdrawals/me", async (request) => {
    const page = Math.max(1, Number(request.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(request.query.pageSize) || 20));
    const [{ total, items }, availableBalance] = await Promise.all([
      repositories.withdrawals.listByUser(request.userId, { page, pageSize }),
      repositories.withdrawals.getAvailableBalance(request.userId)
    ]);
    return {
      withdrawals: items,
      availableBalance,
      availablePoints: centsToPoints(availableBalance),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total
    };
  });

  app.post<{ Body: { points?: number; amountCents?: number; payAccount?: string; payType?: string } }>(
    "/api/withdrawals",
    async (request, reply) => {
      const { points, amountCents: legacyAmountCents, payAccount: rawPayAccount, payType: rawPayType } = request.body ?? {};
      const amountCents = points === undefined ? legacyAmountCents : pointsToCents(points);

      if (
        !amountCents ||
        !Number.isInteger(amountCents) ||
        amountCents < MIN_WITHDRAWAL_CENTS ||
        (points !== undefined &&
          (!Number.isFinite(points) || points <= 0 || Math.abs(amountCents - points * 100) > 1e-6))
      ) {
        return reply.code(400).send({ error: "最低兑换 10 奖励值，最多保留两位小数" });
      }

      const payType = String(rawPayType ?? "").trim();
      const payAccount = String(rawPayAccount ?? "").trim();
      if (payType !== "alipay" && payType !== "wechat") {
        return reply.code(400).send({ error: "请选择收款方式" });
      }
      if (payAccount.length < 3 || payAccount.length > 128 || /[\u0000-\u001f\u007f]/.test(payAccount)) {
        return reply.code(400).send({ error: "请填写正确的收款账号" });
      }

      // 原子校验+创建，防止并发重复提交超额
      const result = await repositories.withdrawals.createIfAffordable({
        userId: request.userId,
        amountCents,
        payAccount,
        payType
      });
      if (!result.ok) {
        return reply.code(400).send({ error: "可兑换奖励值不足" });
      }

      return { withdrawal: result.withdrawal };
    }
  );
}
