export type Platform = "taobao" | "jd" | "pdd" | "vip";

export type UserStatus = "active" | "banned";

export type UserRecord = {
  id: string;
  openid: string;
  unionid: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  status: string;
  createdAt: Date;
};

export type ConversionRecord = {
  id: string;
  userId: string;
  rawContent: string;
  platform: Platform;
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

export type OrderRecord = {
  id: string;
  tbkOrderId: string;
  itemId: string;
  itemTitle: string;
  payTime: Date;
  payAmountCents: number;
  estimatedCommissionCents: number;
  settledCommissionCents: number | null;
  orderStatus: string;
  rawPayload: unknown;
};

export type AttributionRecord = {
  id: string;
  tbkOrderId: string;
  userId: string | null;
  conversionId: string | null;
  copyEventId: string | null;
  status: string;
  confidence: number;
  reason: string;
  createdAt: Date;
};

export type CommissionLedgerRecord = {
  id: string;
  userId: string;
  tbkOrderId: string;
  amountCents: number;
  ledgerType: string;
  status: string;
  reason: string;
  createdAt: Date;
};

export type CheckInRecord = {
  id: string;
  userId: string;
  checkInDate: string;
  points: number;
  createdAt: Date;
};

export type OrderClaimRecord = {
  id: string;
  userId: string;
  orderSuffix: string;
  screenshotUrl: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
};

export type OrderSummary = {
  id: string;
  itemTitle: string;
  status: string;
  estimatedCommissionCents: number;
  userRebateCents: number;
};

export type AdminUserRecord = UserRecord & {
  conversionCount: number;
  copyEventCount: number;
  claimCount: number;
};

export type AdminConfigRecord = {
  dingdanxiaPid: string;
  commissionSharingRatio: number;
  attributionWindowHours: number;
  highValueReviewThresholdCents: number;
};

export type UpsertOrderInput = {
  tbkOrderId: string;
  itemId: string;
  itemTitle: string;
  payTime: Date;
  payAmountCents: number;
  estimatedCommissionCents: number;
  settledCommissionCents: number | null;
  orderStatus: string;
  rawPayload: unknown;
};

export type UpsertAttributionInput = {
  tbkOrderId: string;
  userId?: string | null;
  conversionId?: string | null;
  copyEventId?: string | null;
  status: string;
  confidence: number;
  reason: string;
};

export type CreateCommissionLedgerInput = {
  userId: string;
  tbkOrderId: string;
  amountCents: number;
  ledgerType: string;
  status: string;
  reason: string;
};

export type Repositories = {
  users: {
    findOrCreateByOpenid(openid: string, input?: { unionid?: string | null }): Promise<UserRecord>;
    findById(id: string): Promise<UserRecord | undefined>;
    updateStatus(id: string, status: UserStatus): Promise<UserRecord>;
    updateProfile(id: string, input: { nickname?: string; avatarUrl?: string }): Promise<UserRecord>;
    list(): Promise<AdminUserRecord[]>;
  };
  conversions: {
    create(input: Omit<ConversionRecord, "id" | "createdAt">): Promise<ConversionRecord>;
    findById(id: string): Promise<ConversionRecord | undefined>;
    listByUser(userId: string): Promise<ConversionRecord[]>;
  };
  copyEvents: {
    create(input: Omit<CopyEventRecord, "id" | "copiedAt">): Promise<CopyEventRecord>;
    count(): Promise<number>;
    listByItem(itemId: string): Promise<CopyEventRecord[]>;
  };
  orders: {
    listByUser(userId: string): Promise<OrderSummary[]>;
    upsert(input: UpsertOrderInput): Promise<OrderRecord>;
    upsertAttribution(input: UpsertAttributionInput): Promise<AttributionRecord>;
    listPendingAttributions(): Promise<Array<AttributionRecord & { order: OrderRecord }>>;
    attributeOrder(id: string, input: { userId?: string | null; reviewedBy?: string }): Promise<AttributionRecord>;
    createClaim(input: {
      userId: string;
      orderSuffix: string;
      screenshotUrl?: string | null;
      notes?: string | null;
    }): Promise<OrderClaimRecord>;
    listClaims(status?: string): Promise<Array<OrderClaimRecord & { userOpenid: string }>>;
    reviewClaim(id: string, input: { status: "approved" | "rejected"; reviewedBy?: string }): Promise<OrderClaimRecord>;
  };
  commissionLedger: {
    upsert(input: CreateCommissionLedgerInput): Promise<CommissionLedgerRecord>;
  };
  checkIns: {
    findByUserAndDate(userId: string, checkInDate: string): Promise<CheckInRecord | undefined>;
    create(input: { userId: string; checkInDate: string; points: number }): Promise<CheckInRecord>;
    listRecentDates(userId: string, limit: number): Promise<string[]>;
    totalPoints(userId: string): Promise<number>;
  };
  admin: {
    overview(): Promise<{
      userCount: number;
      conversionCount: number;
      copyEventCount: number;
      pendingAttributionCount: number;
      orderClaimCount: number;
    }>;
  };
};
