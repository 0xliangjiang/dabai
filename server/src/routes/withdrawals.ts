import type { FastifyInstance } from "fastify";
import type { Repositories } from "../repositories/types.js";

const MIN_WITHDRAWAL_CENTS = 1000; // ¥10 minimum

export async function registerWithdrawalRoutes(app: FastifyInstance, repositories: Repositories) {
  app.get("/api/withdrawals/me", async (request) => {
    const [withdrawals, availableBalance] = await Promise.all([
      repositories.withdrawals.listByUser(request.userId),
      repositories.withdrawals.getAvailableBalance(request.userId)
    ]);
    return { withdrawals, availableBalance };
  });

  app.post<{ Body: { amountCents?: number; payAccount?: string; payType?: string; notes?: string } }>(
    "/api/withdrawals",
    async (request, reply) => {
      const { amountCents, payAccount, payType, notes } = request.body ?? {};

      if (!amountCents || amountCents < MIN_WITHDRAWAL_CENTS) {
        return reply.code(400).send({ error: `最低提现金额为 ¥${MIN_WITHDRAWAL_CENTS / 100}` });
      }
      if (!payAccount?.trim()) {
        return reply.code(400).send({ error: "请填写收款账号" });
      }
      if (payType !== "wechat" && payType !== "alipay") {
        return reply.code(400).send({ error: "收款方式无效" });
      }

      const available = await repositories.withdrawals.getAvailableBalance(request.userId);
      if (amountCents > available) {
        return reply.code(400).send({ error: "可提现余额不足" });
      }

      const withdrawal = await repositories.withdrawals.create({
        userId: request.userId,
        amountCents,
        payAccount: payAccount.trim(),
        payType,
        notes: notes?.trim() || null
      });

      return { withdrawal };
    }
  );
}
