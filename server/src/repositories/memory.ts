import { randomUUID } from "node:crypto";

export type UserRecord = {
  id: string;
  openid: string;
  unionid: string | null;
  createdAt: Date;
};

export type ConversionRecord = {
  id: string;
  userId: string;
  rawContent: string;
  platform: "taobao" | "jd" | "pdd" | "vip";
  itemId: string;
  itemTitle: string;
  itemImageUrl: string;
  itemPriceCents: number;
  commissionRate: number;
  estimatedCommissionCents: number;
  estimatedRebateCents: number;
  generatedPassword: string;
  generatedShortUrl: string;
  generatedClickUrl: string;
  createdAt: Date;
};

export type CopyEventRecord = {
  id: string;
  conversionId: string;
  userId: string;
  itemId: string;
  copyType: "password" | "link";
  copiedAt: Date;
};

export type OrderSummary = {
  id: string;
  itemTitle: string;
  status: string;
  estimatedCommissionCents: number;
};

export type Repositories = ReturnType<typeof createRepositories>;

export function createRepositories() {
  const users = new Map<string, UserRecord>();
  const usersByOpenid = new Map<string, string>();
  const conversions = new Map<string, ConversionRecord>();
  const copyEvents = new Map<string, CopyEventRecord>();

  return {
    users: {
      findOrCreateByOpenid(openid: string, input: { unionid?: string | null } = {}): UserRecord {
        const existingId = usersByOpenid.get(openid);
        if (existingId) {
          const existing = users.get(existingId)!;
          if (!existing.unionid && input.unionid) {
            existing.unionid = input.unionid;
          }
          return existing;
        }

        const id = `user-${users.size + 1}`;
        const user: UserRecord = {
          id,
          openid,
          unionid: input.unionid ?? null,
          createdAt: new Date()
        };
        users.set(id, user);
        usersByOpenid.set(openid, id);
        return user;
      },
      list(): UserRecord[] {
        return [...users.values()];
      }
    },
    conversions: {
      create(input: Omit<ConversionRecord, "id" | "createdAt">): ConversionRecord {
        const record: ConversionRecord = {
          id: randomUUID(),
          createdAt: new Date(),
          ...input
        };
        conversions.set(record.id, record);
        return record;
      },
      findById(id: string): ConversionRecord | undefined {
        return conversions.get(id);
      },
      listByUser(userId: string): ConversionRecord[] {
        return [...conversions.values()].filter((record) => record.userId === userId);
      }
    },
    copyEvents: {
      create(input: Omit<CopyEventRecord, "id" | "copiedAt">): CopyEventRecord {
        const record: CopyEventRecord = {
          id: randomUUID(),
          copiedAt: new Date(),
          ...input
        };
        copyEvents.set(record.id, record);
        return record;
      },
      count(): number {
        return copyEvents.size;
      }
    },
    orders: {
      listByUser(_userId: string): OrderSummary[] {
        return [];
      }
    },
    admin: {
      overview() {
        return {
          userCount: users.size,
          conversionCount: conversions.size,
          copyEventCount: copyEvents.size,
          pendingAttributionCount: 0
        };
      }
    }
  };
}
