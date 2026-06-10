import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";

const ALLOWED_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export async function registerUploadRoutes(app: FastifyInstance, uploadDir: string) {
  app.post("/api/uploads/claim-screenshot", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "缺少文件" });
    }

    const extension = ALLOWED_MIME_EXTENSIONS[file.mimetype];
    if (!extension) {
      return reply.code(400).send({ error: "仅支持 JPG、PNG、WebP 图片" });
    }

    const filename = `${randomUUID()}.${extension}`;
    await pipeline(file.file, createWriteStream(path.join(uploadDir, filename)));

    if (file.file.truncated) {
      return reply.code(400).send({ error: "图片不能超过 5MB" });
    }

    return { url: `/uploads/${filename}` };
  });
}
