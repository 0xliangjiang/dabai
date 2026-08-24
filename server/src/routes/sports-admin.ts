import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  generateSportsAccessCode,
  hashSportsAccessCode,
  sportsAccessCodeHint
} from "../domain/sports-access-code.js";
import type { Repositories, SportsAccessCodeRecord } from "../repositories/types.js";
import { sportsTargetDate } from "./sports.js";

const generateSchema = z.object({
  count: z.number().int().min(1).max(100),
  durationDays: z.number().int().min(1).max(3650),
  validUntil: z.string().datetime().nullable().optional()
});

export async function registerAdminSportsRoutes(app: FastifyInstance, repositories: Repositories) {
  app.get<{
    Querystring: { page?: string; pageSize?: string; search?: string; bindStatus?: string };
  }>("/api/admin/sports/users", async (request) => {
    const page = positiveInt(request.query.page, 1);
    const pageSize = Math.min(100, positiveInt(request.query.pageSize, 50));
    const bindStatus = ["bound", "unbound", "none"].includes(request.query.bindStatus ?? "")
      ? request.query.bindStatus as "bound" | "unbound" | "none"
      : undefined;
    return repositories.sportsAccounts.listAdmin({
      page,
      pageSize,
      search: request.query.search,
      bindStatus,
      targetDate: sportsTargetDate()
    });
  });

  app.post<{ Params: { userId: string } }>("/api/admin/sports/users/:userId/unbind", async (request, reply) => {
    const account = await repositories.sportsAccounts.adminUnbind(request.params.userId);
    if (!account) return reply.code(404).send({ error: "该用户尚未创建 Zepp Life 账号" });
    return {
      ok: true,
      account: {
        email: account.email,
        bindStatus: account.bindStatus,
        membershipExpiresAt: account.membershipExpiresAt
      }
    };
  });

  app.get<{
    Querystring: { page?: string; pageSize?: string; status?: string; search?: string };
  }>("/api/admin/sports/access-codes", async (request) => {
    const status = ["active", "redeemed", "revoked", "expired"].includes(request.query.status ?? "")
      ? request.query.status as "active" | "redeemed" | "revoked" | "expired"
      : undefined;
    const result = await repositories.sportsAccessCodes.list({
      page: positiveInt(request.query.page, 1),
      pageSize: Math.min(100, positiveInt(request.query.pageSize, 50)),
      status,
      search: request.query.search
    });
    return { ...result, items: result.items.map(safeCodeView) };
  });

  app.post<{ Body: unknown }>("/api/admin/sports/access-codes/generate", async (request, reply) => {
    const parsed = generateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "卡密参数不正确" });
    const batchId = randomUUID();
    const validUntil = parsed.data.validUntil ? new Date(parsed.data.validUntil) : null;
    if (validUntil && validUntil.getTime() <= Date.now()) return reply.code(400).send({ error: "兑换截止时间必须晚于当前时间" });
    const codes = Array.from({ length: parsed.data.count }, generateSportsAccessCode);
    const records = await repositories.sportsAccessCodes.createBatch(codes.map((code) => ({
      codeHash: hashSportsAccessCode(code),
      codeHint: sportsAccessCodeHint(code),
      batchId,
      durationDays: parsed.data.durationDays,
      validUntil
    })));
    return {
      ok: true,
      batchId,
      durationDays: parsed.data.durationDays,
      validUntil,
      codes: records.map((record, index) => ({ id: record.id, code: codes[index]!, codeHint: record.codeHint }))
    };
  });

  app.post<{ Params: { id: string } }>("/api/admin/sports/access-codes/:id/revoke", async (request, reply) => {
    const record = await repositories.sportsAccessCodes.revoke(request.params.id, new Date());
    if (!record) return reply.code(409).send({ error: "卡密不存在，或已使用/撤销" });
    return { ok: true, code: safeCodeView(record) };
  });
}

function safeCodeView(record: SportsAccessCodeRecord) {
  const { codeHash: _codeHash, ...safe } = record;
  return {
    ...safe,
    effectiveStatus: safe.status === "active" && safe.validUntil && safe.validUntil.getTime() <= Date.now()
      ? "expired"
      : safe.status
  };
}

function positiveInt(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
