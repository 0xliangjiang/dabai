import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import { syncJdOrders, syncTaobaoOrders } from "../domain/order-sync.js";
import type { Repositories } from "../repositories/types.js";

export async function registerJobRoutes(
  app: FastifyInstance,
  config: AppConfig,
  repositories: Repositories
) {
  app.post("/api/jobs/sync-tbk-orders", async (request, reply) => {
    const schedulerOk = request.headers["x-scheduler-token"] === config.schedulerToken;
    const adminOk = request.headers["x-admin-token"] === config.adminToken;
    if (!schedulerOk && !adminOk) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const globalRatio =
      (await repositories.settings.getCommissionSharingRatio()) ?? config.commissionSharingRatio;
    const { orderClient, taobaoOrderClient } = await app.deps.buildOrderClients();
    const [taobao, jd] = await Promise.all([
      syncTaobaoOrders(repositories, taobaoOrderClient, {
        commissionSharingRatio: globalRatio,
        attributionWindowHours: 24
      }),
      syncJdOrders(repositories, orderClient, {
        commissionSharingRatio: globalRatio,
        attributionWindowHours: 24
      })
    ]);

    return { ok: true, taobao, jd };
  });
}
