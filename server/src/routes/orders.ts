import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../repositories/types.js";

export async function registerOrderRoutes(app: FastifyInstance, repositories: Repositories) {
  app.get("/api/orders/me", async (request) => ({
    orders: await repositories.orders.listByUser(request.userId)
  }));

  app.post<{
    Body: {
      orderSuffix?: string;
      screenshotUrl?: string;
      notes?: string;
    };
  }>("/api/orders/claim", async (request, reply) => {
    const parsed = claimSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "orderSuffix is required" });
    }

    const claim = await repositories.orders.createClaim({
      userId: request.userId,
      orderSuffix: parsed.data.orderSuffix,
      screenshotUrl: parsed.data.screenshotUrl,
      notes: parsed.data.notes
    });

    return {
      ...claim,
      status: "pending_review"
    };
  });
}

const claimSchema = z.object({
  orderSuffix: z.string().trim().min(4).max(32),
  screenshotUrl: z.string().trim().url().optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal(""))
});
