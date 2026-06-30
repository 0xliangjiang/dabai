import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import { resolveCommissionOptions, runOrderSync } from "../domain/order-sync.js";
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

    const commissionOptions = await resolveCommissionOptions(repositories, config);
    const { orderClient, taobaoOrderClient, taobaoProductClient } = await app.deps.buildOrderClients();
    const result = await runOrderSync(
      repositories,
      { taobaoOrderClient, taobaoProductClient, orderClient },
      { attributionWindowHours: 24, ...commissionOptions },
      "manual"
    );

    // 返回体兼容后台「同步订单」按钮原有读取（taobao/jd.synced）
    return {
      ok: result.ok,
      taobao: { synced: result.taobaoSynced, attributed: result.taobaoAttributed },
      jd: { synced: result.jdSynced, attributed: result.jdAttributed },
      errorMessage: result.errorMessage
    };
  });
}
