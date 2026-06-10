import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import type { Repositories } from "../repositories/types.js";

function resolveTemplateId(config: AppConfig): string {
  if (config.wechatDealTemplateId) return config.wechatDealTemplateId;
  // 开发环境占位模板，便于联调订阅流程
  return config.nodeEnv === "production" ? "" : "dev-deal-template";
}

export async function registerSubscriptionRoutes(
  app: FastifyInstance,
  config: AppConfig,
  repositories: Repositories
) {
  app.get("/api/subscriptions/me", async (request) => {
    const templateId = resolveTemplateId(config);
    const remaining = templateId
      ? await repositories.subscriptions.countUnused(request.userId, templateId)
      : 0;
    return { templateId, remaining };
  });

  app.post("/api/subscriptions", async (request, reply) => {
    const templateId = resolveTemplateId(config);
    if (!templateId) {
      return reply.code(400).send({ error: "订阅模板未配置" });
    }
    await repositories.subscriptions.addGrant(request.userId, templateId);
    const remaining = await repositories.subscriptions.countUnused(request.userId, templateId);
    return { ok: true, remaining };
  });
}
