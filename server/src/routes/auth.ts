import type { FastifyInstance } from "fastify";
import type { Repositories } from "../repositories/memory.js";

export async function registerAuthRoutes(app: FastifyInstance, repositories: Repositories) {
  app.post<{ Body: { code?: string } }>("/api/auth/wechat-login", async (request, reply) => {
    const code = request.body.code?.trim();
    if (!code) {
      return reply.code(400).send({ error: "code is required" });
    }

    const user = repositories.users.findOrCreateByOpenid(`mock_openid_${code}`);
    return {
      token: `local_${user.id}`,
      user
    };
  });
}
