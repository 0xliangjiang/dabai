import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../repositories/types.js";

const mediaUrl = z
  .string()
  .trim()
  .refine((value) => value.startsWith("/uploads/") || /^https:\/\//.test(value), {
    message: "media url must be an uploaded file path or https URL"
  });

const align = z.enum(["left", "center", "right"]).optional();
const text = z.string().trim().min(1).max(5000);
const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    text,
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    align
  }),
  z.object({
    type: z.literal("heading"),
    text: z.string().trim().min(1).max(200),
    level: z.union([z.literal(2), z.literal(3)]),
    align
  }),
  z.object({
    type: z.literal("image"),
    url: mediaUrl,
    caption: z.string().trim().max(200).nullish()
  }),
  z.object({ type: z.literal("quote"), text }),
  z.object({
    type: z.literal("list"),
    style: z.enum(["ordered", "unordered"]),
    items: z.array(z.string().trim().min(1).max(500)).min(1).max(50)
  }),
  z.object({
    type: z.literal("callout"),
    tone: z.enum(["info", "success", "warning"]),
    text
  }),
  z.object({ type: z.literal("divider") })
]);

const articleSchema = z.object({
  title: z.string().trim().min(1).max(100),
  summary: z.string().trim().max(300).nullish(),
  coverUrl: mediaUrl.nullish().or(z.literal("")),
  status: z.enum(["draft", "published"]),
  pinned: z.boolean().optional(),
  blocks: z.array(blockSchema).min(1).max(100)
});

export async function registerArticleRoutes(app: FastifyInstance, repositories: Repositories) {
  app.get<{ Querystring: { page?: string; pageSize?: string } }>("/api/articles", async (request) => {
    const page = positiveInteger(request.query.page, 1);
    const pageSize = Math.min(50, positiveInteger(request.query.pageSize, 20));
    const result = await repositories.articles.list(true, { page, pageSize });
    return {
      articles: result.items.map((article) => ({
        id: article.id,
        title: article.title,
        summary: article.summary,
        coverUrl: article.coverUrl,
        pinned: article.pinned,
        visitorCount: article.visitorCount,
        publishedAt: article.publishedAt ?? article.createdAt
      })),
      total: result.total,
      page,
      pageSize,
      hasMore: page * pageSize < result.total
    };
  });

  app.get<{ Params: { id: string } }>("/api/articles/:id", async (request, reply) => {
    const article = await repositories.articles.findById(request.params.id);
    if (!article || article.status !== "published") {
      return reply.code(404).send({ error: "文章不存在或已下线" });
    }
    return { article };
  });

  app.post<{ Params: { id: string }; Body: { visitorId?: string } }>(
    "/api/articles/:id/view",
    async (request, reply) => {
      const visitorId = (request.body?.visitorId ?? "").trim().slice(0, 64);
      if (!visitorId) return reply.code(400).send({ error: "visitorId required" });
      const article = await repositories.articles.findById(request.params.id);
      if (!article || article.status !== "published") {
        return reply.code(404).send({ error: "文章不存在或已下线" });
      }
      await repositories.articles.recordView(request.params.id, visitorId);
      return { ok: true };
    }
  );
}

export async function registerAdminArticleRoutes(app: FastifyInstance, repositories: Repositories) {
  app.get("/api/admin/articles", async () => {
    const result = await repositories.articles.list(false, { page: 1, pageSize: 500 });
    return { articles: result.items, total: result.total };
  });

  app.post("/api/admin/articles", async (request, reply) => {
    const parsed = articleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "文章内容不完整或格式不正确" });
    }
    return repositories.articles.create({
      ...parsed.data,
      coverUrl: parsed.data.coverUrl || null
    });
  });

  app.put<{ Params: { id: string } }>("/api/admin/articles/:id", async (request, reply) => {
    const parsed = articleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "文章内容不完整或格式不正确" });
    }
    const existing = await repositories.articles.findById(request.params.id);
    if (!existing) return reply.code(404).send({ error: "文章不存在" });
    return repositories.articles.update(request.params.id, {
      ...parsed.data,
      coverUrl: parsed.data.coverUrl || null
    });
  });

  app.delete<{ Params: { id: string } }>("/api/admin/articles/:id", async (request, reply) => {
    const existing = await repositories.articles.findById(request.params.id);
    if (!existing) return reply.code(404).send({ error: "文章不存在" });
    await repositories.articles.remove(request.params.id);
    return { ok: true };
  });
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
