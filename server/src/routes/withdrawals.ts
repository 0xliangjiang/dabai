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

  app.post<{ Body: { amountCents?: number } }>(
    "/api/withdrawals",
    async (request, reply) => {
      const { amountCents } = request.body ?? {};

      if (!amountCents || amountCents < MIN_WITHDRAWAL_CENTS) {
        return reply.code(400).send({ error: `最低兑换 ${MIN_WITHDRAWAL_CENTS} 积分` });
      }

      const available = await repositories.withdrawals.getAvailableBalance(request.userId);
      if (amountCents > available) {
        return reply.code(400).send({ error: "可兑换积分不足" });
      }

      const withdrawal = await repositories.withdrawals.create({
        userId: request.userId,
        amountCents,
        payAccount: "",
        payType: "redpacket",
        notes: null
      });

      return { withdrawal };
    }
  );
}
