import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../repositories/types.js";

const profileSchema = z.object({
  nickname: z.string().trim().min(1).max(32).optional(),
  avatarUrl: z
    .string()
    .trim()
    .refine((value) => value.startsWith("/uploads/") || /^https:\/\//.test(value), {
      message: "avatarUrl must be an uploaded file path or https URL"
    })
    .optional()
});

export async function registerUserRoutes(app: FastifyInstance, repositories: Repositories) {
  app.get("/api/users/me", async (request) => ({
    user: await repositories.users.findById(request.userId)
  }));

  app.post<{ Body: { nickname?: string; avatarUrl?: string } }>(
    "/api/users/me/profile",
    async (request, reply) => {
      const parsed = profileSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "昵称或头像格式不正确" });
      }
      if (parsed.data.nickname === undefined && parsed.data.avatarUrl === undefined) {
        return reply.code(400).send({ error: "没有需要更新的内容" });
      }

      // 用户不存在（如开发环境内存库重启被清）返回 401，触发小程序自动重新登录
      const existing = await repositories.users.findById(request.userId);
      if (!existing) {
        return reply.code(401).send({ error: "登录已过期，请重新登录" });
      }

      const user = await repositories.users.updateProfile(request.userId, parsed.data);
      return { user };
    }
  );
}
