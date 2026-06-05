import type { FastifyInstance } from "fastify";
import { ConversionValidationError, createConversion } from "../domain/conversion.js";
import type { TaobaoClient } from "../integrations/taobao/client.js";
import type { Repositories } from "../repositories/memory.js";

export async function registerConversionRoutes(
  app: FastifyInstance,
  repositories: Repositories,
  taobaoClient: TaobaoClient
) {
  app.post<{ Body: { rawContent?: string } }>("/api/conversions", async (request, reply) => {
    try {
      return await createConversion(
        {
          userId: request.userId,
          rawContent: request.body.rawContent ?? ""
        },
        taobaoClient,
        repositories
      );
    } catch (error) {
      if (error instanceof ConversionValidationError) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post<{ Params: { id: string }; Body: { copyType?: "password" | "link" } }>(
    "/api/conversions/:id/copy",
    async (request, reply) => {
      const conversion = repositories.conversions.findById(request.params.id);
      if (!conversion || conversion.userId !== request.userId) {
        return reply.code(404).send({ error: "conversion not found" });
      }

      return repositories.copyEvents.create({
        conversionId: conversion.id,
        userId: request.userId,
        itemId: conversion.itemId,
        copyType: request.body.copyType ?? "password"
      });
    }
  );

  app.get("/api/conversions", async (request) => ({
    conversions: repositories.conversions.listByUser(request.userId)
  }));
}
