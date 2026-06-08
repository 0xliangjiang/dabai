import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import { syncJdOrders } from "../domain/order-sync.js";
import type { DingdanxiaOrderClient } from "../integrations/dingdanxia/orders.js";
import type { Repositories } from "../repositories/types.js";

export async function registerJobRoutes(
  app: FastifyInstance,
  config: AppConfig,
  repositories: Repositories,
  orderClient: DingdanxiaOrderClient
) {
  app.post("/api/jobs/sync-tbk-orders", async (request, reply) => {
    if (request.headers["x-scheduler-token"] !== config.schedulerToken) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    return syncJdOrders(repositories, orderClient, {
      commissionSharingRatio: config.commissionSharingRatio,
      attributionWindowHours: 24
    });
  });
}
