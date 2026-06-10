import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DealPublishedNotifier } from "../domain/deal-notify.js";
import type { Repositories } from "../repositories/types.js";

const mediaUrl = z
  .string()
  .trim()
  .refine((value) => value.startsWith("/uploads/") || /^https:\/\//.test(value), {
    message: "media url must be an uploaded file path or https URL"
  });

const stepSchema = z.object({
  content: z.string().trim().min(1).max(1000),
  copyType: z.enum(["link", "password"]).nullish(),
  copyValue: z.string().trim().max(2000).nullish(),
  images: z.array(mediaUrl).max(9).optional(),
  videoUrl: mediaUrl.nullish().or(z.literal(""))
});

const dealSchema = z.object({
  title: z.string().trim().min(1).max(100),
  summary: z.string().trim().max(200).nullish(),
  status: z.enum(["draft", "published"]),
  pinned: z.boolean().optional(),
  steps: z.array(stepSchema).min(1).max(30)
});

export async function registerDealRoutes(app: FastifyInstance, repositories: Repositories) {
  // 用户端：仅已发布
  app.get("/api/deals", async () => {
    const deals = await repositories.deals.list(true);
    return {
      deals: deals.map((deal) => ({
        id: deal.id,
        title: deal.title,
        summary: deal.summary,
        pinned: deal.pinned,
        stepCount: deal.steps.length,
        publishedAt: deal.publishedAt ?? deal.createdAt
      }))
    };
  });

  app.get<{ Params: { id: string } }>("/api/deals/:id", async (request, reply) => {
    const deal = await repositories.deals.findById(request.params.id);
    if (!deal || deal.status !== "published") {
      return reply.code(404).send({ error: "线报不存在或已下线" });
    }
    return { deal };
  });
}

export async function registerAdminDealRoutes(
  app: FastifyInstance,
  repositories: Repositories,
  notifyDealPublished?: DealPublishedNotifier
) {
  app.get("/api/admin/deals", async () => ({
    deals: await repositories.deals.list(false)
  }));

  app.post("/api/admin/deals", async (request, reply) => {
    const parsed = dealSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "线报内容不完整或格式不正确" });
    }
    const deal = await repositories.deals.create(parsed.data);
    if (deal.status === "published" && notifyDealPublished) {
      await notifyDealPublished(deal);
    }
    return deal;
  });

  app.put<{ Params: { id: string } }>("/api/admin/deals/:id", async (request, reply) => {
    const parsed = dealSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "线报内容不完整或格式不正确" });
    }
    const before = await repositories.deals.findById(request.params.id);
    const deal = await repositories.deals.update(request.params.id, parsed.data);
    // 仅在状态从非发布变为发布时通知，避免编辑已发布内容重复打扰
    if (deal.status === "published" && before?.status !== "published" && notifyDealPublished) {
      await notifyDealPublished(deal);
    }
    return deal;
  });

  app.delete<{ Params: { id: string } }>("/api/admin/deals/:id", async (request) => {
    await repositories.deals.remove(request.params.id);
    return { ok: true };
  });
}
