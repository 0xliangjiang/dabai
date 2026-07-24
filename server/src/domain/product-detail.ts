import type { TaobaoProductDetail, TaobaoProductClient } from "../integrations/taobao/client.js";
import type { Platform, Repositories, UpsertProductSnapshotInput } from "../repositories/types.js";

const PRODUCT_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

export type ProductFallback = {
  platform: Platform;
  itemId: string;
  itemTitle: string;
  itemImageUrl?: string | null;
  itemPriceCents?: number | null;
};

export async function resolveProductDetail(
  repositories: Repositories,
  client: TaobaoProductClient | undefined,
  fallback: ProductFallback
): Promise<ProductFallback> {
  const itemId = fallback.itemId.trim();
  if (!itemId || fallback.platform !== "taobao") return fallback;

  const cached = await repositories.productSnapshots.find(fallback.platform, itemId);
  if (cached && Date.now() - cached.updatedAt.getTime() < PRODUCT_SNAPSHOT_TTL_MS) {
    return {
      platform: cached.platform,
      itemId: cached.itemId,
      itemTitle: cached.itemTitle,
      itemImageUrl: cached.itemImageUrl,
      itemPriceCents: cached.itemPriceCents
    };
  }

  const detail = await safeFetchProductDetail(client, itemId);
  if (!detail?.itemTitle?.trim()) {
    return cached
      ? {
          platform: cached.platform,
          itemId: cached.itemId,
          itemTitle: cached.itemTitle,
          itemImageUrl: cached.itemImageUrl,
          itemPriceCents: cached.itemPriceCents
        }
      : fallback;
  }

  const snapshot = await repositories.productSnapshots.upsert(toSnapshotInput(detail));
  return {
    platform: snapshot.platform,
    itemId: snapshot.itemId,
    itemTitle: snapshot.itemTitle,
    itemImageUrl: snapshot.itemImageUrl,
    itemPriceCents: snapshot.itemPriceCents
  };
}

async function safeFetchProductDetail(
  client: TaobaoProductClient | undefined,
  itemId: string
): Promise<TaobaoProductDetail | undefined> {
  if (!client?.getProductDetail) return undefined;
  try {
    return await client.getProductDetail(itemId);
  } catch (error) {
    console.warn(`[product-detail] 查询商品详情失败 itemId=${itemId}:`, (error as Error).message);
    return undefined;
  }
}

function toSnapshotInput(detail: TaobaoProductDetail): UpsertProductSnapshotInput {
  return {
    platform: detail.platform,
    itemId: detail.itemId,
    itemTitle: detail.itemTitle,
    itemImageUrl: detail.itemImageUrl,
    itemPriceCents: detail.itemPriceCents,
    rawPayload: detail.rawPayload ?? {}
  };
}
