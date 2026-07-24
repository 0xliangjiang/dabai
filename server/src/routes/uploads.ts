import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { open, rename, unlink } from "node:fs/promises";
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
    handleAvatarUpload(request, reply, uploadDir)
  );
}

async function handleAvatarUpload(request: FastifyRequest, reply: FastifyReply, uploadDir: string) {
  return handleMediaUpload(
    request,
    reply,
    uploadDir,
    { ...IMAGE_MIME_EXTENSIONS, "application/octet-stream": "jpg", "": "jpg" },
    "仅支持 JPG、PNG、WebP 图片",
    5 * 1024 * 1024
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

  if (!allowedMimes[file.mimetype]) {
    return reply.code(400).send({ error: mimeError });
  }

  const uploadId = randomUUID();
  const temporaryPath = path.join(uploadDir, `${uploadId}.uploading`);
  try {
    await pipeline(file.file, createWriteStream(temporaryPath, { flags: "wx" }));
    if (file.file.truncated) {
      await unlink(temporaryPath).catch(() => undefined);
      return reply.code(400).send({ error: "文件超出大小限制" });
    }

    const detectedExtension = await detectMediaExtension(temporaryPath);
    const allowedExtensions = new Set(Object.values(allowedMimes));
    if (!detectedExtension || !allowedExtensions.has(detectedExtension)) {
      await unlink(temporaryPath).catch(() => undefined);
      return reply.code(400).send({ error: "文件内容与支持的图片或视频格式不符" });
    }

    const filename = `${uploadId}.${detectedExtension}`;
    await rename(temporaryPath, path.join(uploadDir, filename));
    return { url: `/uploads/${filename}` };
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function detectMediaExtension(filePath: string): Promise<string | undefined> {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "jpg";
    if (bytesRead >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return "png";
    }
    if (bytesRead >= 12 && header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") {
      return "webp";
    }
    if (bytesRead >= 12 && header.toString("ascii", 4, 8) === "ftyp") return "mp4";
    return undefined;
  } finally {
    await handle.close();
  }
}
