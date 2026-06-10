import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const MEDIA_MIME_EXTENSIONS: Record<string, string> = {
  ...IMAGE_MIME_EXTENSIONS,
  "video/mp4": "mp4"
};

export async function registerUploadRoutes(app: FastifyInstance, uploadDir: string) {
  app.post("/api/uploads/claim-screenshot", (request, reply) =>
    handleMediaUpload(request, reply, uploadDir, IMAGE_MIME_EXTENSIONS, "仅支持 JPG、PNG、WebP 图片")
  );
  app.post("/api/uploads/avatar", (request, reply) =>
    handleMediaUpload(request, reply, uploadDir, IMAGE_MIME_EXTENSIONS, "仅支持 JPG、PNG、WebP 图片")
  );
}

export async function handleMediaUpload(
  request: FastifyRequest,
  reply: FastifyReply,
  uploadDir: string,
  allowedMimes: Record<string, string> = MEDIA_MIME_EXTENSIONS,
  mimeError = "仅支持 JPG、PNG、WebP 图片或 MP4 视频",
  maxFileSize = 5 * 1024 * 1024
) {
  const file = await request.file({ limits: { fileSize: maxFileSize } });
  if (!file) {
    return reply.code(400).send({ error: "缺少文件" });
  }

  const extension = allowedMimes[file.mimetype];
  if (!extension) {
    return reply.code(400).send({ error: mimeError });
  }

  const filename = `${randomUUID()}.${extension}`;
  await pipeline(file.file, createWriteStream(path.join(uploadDir, filename)));

  if (file.file.truncated) {
    return reply.code(400).send({ error: "文件超出大小限制" });
  }

  return { url: `/uploads/${filename}` };
}
