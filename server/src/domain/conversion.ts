import type { TaobaoClient } from "../integrations/taobao/client.js";
import type { ConversionRecord, Repositories } from "../repositories/memory.js";

export type CreateConversionInput = {
  userId: string;
  rawContent: string;
};

export async function createConversion(
  input: CreateConversionInput,
  taobaoClient: TaobaoClient,
  repositories: Repositories
): Promise<ConversionRecord> {
  const rawContent = input.rawContent.trim();
  if (!rawContent) {
    throw new ConversionValidationError("rawContent is required");
  }

  const converted = await taobaoClient.convert(rawContent);

  return repositories.conversions.create({
    userId: input.userId,
    rawContent,
    ...converted
  });
}

export class ConversionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversionValidationError";
  }
}
