import type { FastifyInstance } from "fastify";
import type { Repositories } from "../repositories/memory.js";

export async function registerOrderRoutes(app: FastifyInstance, repositories: Repositories) {
  app.get("/api/orders/me", async (request) => ({
    orders: repositories.orders.listByUser(request.userId)
  }));

  app.post("/api/orders/claim", async () => ({
    status: "pending_review"
  }));
}
