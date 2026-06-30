import type { TaobaoClient } from "../integrations/taobao/client.js";
import type { ConversionRecord, Repositories } from "../repositories/types.js";
import { resolveProductDetail } from "./product-detail.js";

export type CreateConversionInput = {
  userId: string;
  rawContent: string;
};

export async function createConversion(
  input: CreateConversionInput,
  taobaoClient: TaobaoClient,
  repositories: Repositories,
  options: { commissionSharingRatio?: number } = {}
): Promise<ConversionRecord> {
  const rawContent = input.rawContent.trim();
  if (!rawContent) {
    throw new ConversionValidationError("rawContent is required");
  }

  const converted = await taobaoClient.convert(rawContent);
  const product = await resolveProductDetail(repositories, taobaoClient, {
    platform: converted.platform,
    itemId: converted.itemId,
    itemTitle: converted.itemTitle,
    itemImageUrl: converted.itemImageUrl,
    itemPriceCents: converted.itemPriceCents
  });

  return repositories.conversions.create({
    userId: input.userId,
    rawContent,
    ...converted,
    itemTitle: product.itemTitle,
    itemImageUrl: product.itemImageUrl ?? converted.itemImageUrl,
    itemPriceCents: product.itemPriceCents ?? converted.itemPriceCents,
    estimatedRebateCents: Math.round(
      converted.estimatedCommissionCents * (options.commissionSharingRatio ?? 0)
    )
  });
}

export class ConversionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversionValidationError";
  }
}
