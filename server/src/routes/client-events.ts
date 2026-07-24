import type { FastifyInstance } from "fastify";
import { z } from "zod";

const eventSchema = z.object({
  name: z.enum([
    "clipboard_paste",
    "conversion_success",
    "conversion_failed",
    "copy_success",
    "order_bind_success",
    "order_bind_failed",
    "subscription_accepted",
    "subscription_rejected",
    "withdrawal_submitted",
    "withdrawal_failed",
    "invite_share_opened"
  ]),
  visitorId: z.string().trim().min(1).max(64),
  properties: z.record(z.string(), z.union([z.string().max(100), z.number(), z.boolean()])).optional()
});

export async function registerClientEventRoutes(app: FastifyInstance) {
  app.post("/api/client-events", async (request, reply) => {
    const parsed = eventSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid event" });
    }
    app.log.info(
      {
        eventName: parsed.data.name,
        visitorId: parsed.data.visitorId,
        properties: parsed.data.properties ?? {}
      },
      "client_event"
    );
    return reply.code(202).send({ ok: true });
  });
}
