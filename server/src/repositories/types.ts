export type Platform = "taobao" | "jd" | "pdd" | "vip";

export type UserStatus = "active" | "banned";

export type UserRecord = {
  id: string;
  openid: string;
  unionid: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  status: string;
  rebateRatio: number | null;
  inviterId: string | null;
  createdAt: Date;
};

export type SportsAccountRecord = {
  id: string;
  userId: string;
  email: string;
  passwordCipher: string;
  loginTokenCipher: string | null;
  appTokenCipher: string | null;
  zeppUserId: string | null;
  status: string;
  bindStatus: string;
  captchaKey: string | null;
  captchaExpiresAt: Date | null;
  membershipExpiresAt: Date | null;
  lastTargetSteps: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SportsDailyTargetRecord = {
  id: string;
  userId: string;
  targetDate: string;
  steps: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SportsAdminUserRecord = {
  id: string;
  openid: string;
  nickname: string | null;
  avatarUrl: string | null;
  userStatus: string;
  createdAt: Date;
  account: Pick<SportsAccountRecord, "email" | "status" | "bindStatus" | "membershipExpiresAt" | "updatedAt"> | null;
  todayTargetSteps: number | null;
};

export type SportsAccessCodeRecord = {
  id: string;
  code: string | null;
  codeHash: string;
  codeHint: string;
  batchId: string;
  durationDays: number;
  status: string;
  validUntil: Date | null;
  redeemedByUserId: string | null;
  redeemedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  redeemedByNickname?: string | null;
};

export type SportsAdGrantRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  status: string;
  expiresAt: Date;
  reservedAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReferralSummary = {
  downlineCount: number;
  earnedCents: number;
  pendingCents: number;
};

export type ConversionAdminRecord = {
  id: string;
  userId: string;
  userNickname: string | null;
  userOpenid: string;
  itemId: string;
  itemTitle: string;
  platform: string;
  estimatedRebateCents: number;
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

export type ProductSnapshotRecord = {
  id: string;
  platform: Platform;
  itemId: string;
  itemTitle: string;
  itemImageUrl: string;
  itemPriceCents: number;
  rawPayload: unknown;
  createdAt: Date;
  updatedAt: Date;
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
  manualStatus: string | null;
  receivedAt: Date | null;
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
  points: number; // 签到奖励值的存储单位为 0.01，字段名为兼容既有数据而保留
  createdAt: Date;
};

export type DealStep = {
  content: string;
  copyType?: "link" | "password" | null;
  copyValue?: string | null;
  images?: string[];
  videoUrl?: string | null;
};

export type DealPostRecord = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  pinned: boolean;
  steps: DealStep[];
  viewCount: number;
  visitorCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DealPostInput = {
  title: string;
  summary?: string | null;
  status: "draft" | "published";
  pinned?: boolean;
  steps: DealStep[];
};

export type ArticleTextBlock = {
  type: "paragraph";
  text: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
};

export type ArticleBlock =
  | ArticleTextBlock
  | { type: "heading"; text: string; level: 2 | 3; align?: "left" | "center" | "right" }
  | { type: "image"; url: string; caption?: string | null }
  | { type: "quote"; text: string }
  | { type: "list"; style: "ordered" | "unordered"; items: string[] }
  | { type: "callout"; tone: "info" | "success" | "warning"; text: string }
  | { type: "divider" };

export type ArticlePostRecord = {
  id: string;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  status: string;
  pinned: boolean;
  blocks: ArticleBlock[];
  viewCount: number;
  visitorCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ArticlePostInput = {
  title: string;
  summary?: string | null;
  coverUrl?: string | null;
  status: "draft" | "published";
  pinned?: boolean;
  blocks: ArticleBlock[];
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

export type WithdrawalRecord = {
  id: string;
  userId: string;
  amountCents: number;
  status: string;
  payAccount: string;
  payType: string;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminWithdrawalRecord = WithdrawalRecord & {
  userNickname: string | null;
  userOpenid: string;
};

export type OrderSyncRunRecord = {
  id: string;
  trigger: string;
  ok: boolean;
  taobaoSynced: number;
  taobaoAttributed: number;
  jdSynced: number;
  jdAttributed: number;
  errorMessage: string | null;
  durationMs: number;
  createdAt: Date;
};

export type OrderSummary = {
  id: string;
  orderNumber: string;
  itemTitle: string;
  status: string;
  payTime: Date;
  payAmountCents: number;
  estimatedCommissionCents: number;
  settledCommissionCents: number | null;
  userRebateCents: number;
  // 返利台账状态：available 已到账可提现 / pending 待结算 / reversed 已冲销 / none 尚无台账
  rebateStatus: "available" | "pending" | "reversed" | "none";
};

export type AdminUserRecord = UserRecord & {
  conversionCount: number;
  copyEventCount: number;
  claimCount: number;
  orderCount: number;
  inviterNickname: string | null;
  downlineCount: number;
  availableBalanceCents: number;
};

export type DownlineRecord = {
  id: string;
  nickname: string | null;
  openid: string;
  createdAt: Date;
  contributedCents: number; // 该下线为上级贡献的二级提成累计
};

export type AdminConfigRecord = {
  zhetaokePid: string;
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

export type UpsertProductSnapshotInput = {
  platform: Platform;
  itemId: string;
  itemTitle: string;
  itemImageUrl?: string | null;
  itemPriceCents?: number | null;
  rawPayload?: unknown;
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
    findOrCreateByOpenid(
      openid: string,
      input?: { unionid?: string | null; inviterId?: string | null }
    ): Promise<UserRecord>;
    findById(id: string): Promise<UserRecord | undefined>;
    applyPendingSportsInviteRewards(
      inviterId: string,
      durationDays: number,
      now: Date
    ): Promise<{ rewardedCount: number; membershipExpiresAt: Date | null }>;
    // 认证路径专用：被软删用户带 token 回访时自动复活（清除 deletedAt），
    // 让删除后又回来的用户重新出现在后台、可被管理。truly 不存在则返回 undefined。
    getOrReviveById(id: string): Promise<UserRecord | undefined>;
    referralSummary(userId: string): Promise<ReferralSummary>;
    updateStatus(id: string, status: UserStatus): Promise<UserRecord>;
    updateProfile(id: string, input: { nickname?: string; avatarUrl?: string }): Promise<UserRecord>;
    list(options?: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: UserStatus;
      relation?: "has_downline" | "has_inviter" | "no_inviter";
      sort?: "newest" | "oldest" | "downline_desc";
    }): Promise<{ total: number; items: AdminUserRecord[] }>;
    listDownline(
      inviterId: string,
      options?: { page?: number; pageSize?: number }
    ): Promise<{ total: number; items: DownlineRecord[] }>;
    deleteUser(id: string): Promise<void>;
    adjustPoints(id: string, input: { delta: number; reason: string }): Promise<void>;
    setRebateRatio(id: string, ratio: number | null): Promise<UserRecord>;
  };
  sportsAccounts: {
    findByUser(userId: string): Promise<SportsAccountRecord | undefined>;
    create(input: {
      userId: string;
      email: string;
      passwordCipher: string;
      captchaKey: string;
      captchaExpiresAt: Date;
      membershipExpiresAt: Date | null;
    }): Promise<SportsAccountRecord>;
    update(
      userId: string,
      input: Partial<
        Pick<
          SportsAccountRecord,
          | "passwordCipher"
          | "loginTokenCipher"
          | "appTokenCipher"
          | "zeppUserId"
          | "status"
          | "bindStatus"
          | "captchaKey"
          | "captchaExpiresAt"
          | "membershipExpiresAt"
          | "lastTargetSteps"
        >
      >
    ): Promise<SportsAccountRecord>;
    claimCaptcha(userId: string, now: Date): Promise<boolean>;
    listAdmin(options: {
      page: number;
      pageSize: number;
      search?: string;
      bindStatus?: "bound" | "unbound" | "none";
      targetDate: string;
    }): Promise<{ total: number; items: SportsAdminUserRecord[] }>;
    adminUnbind(userId: string): Promise<SportsAccountRecord | undefined>;
  };
  sportsDailyTargets: {
    findByUserAndDate(
      userId: string,
      targetDate: string
    ): Promise<SportsDailyTargetRecord | undefined>;
    upsert(userId: string, targetDate: string, steps: number): Promise<SportsDailyTargetRecord>;
  };
  sportsAccessCodes: {
    createBatch(inputs: Array<{
      code: string;
      codeHash: string;
      codeHint: string;
      batchId: string;
      durationDays: number;
      validUntil: Date | null;
    }>): Promise<SportsAccessCodeRecord[]>;
    list(options: {
      page: number;
      pageSize: number;
      status?: "active" | "redeemed" | "revoked" | "expired";
      search?: string;
    }): Promise<{ total: number; items: SportsAccessCodeRecord[] }>;
    revoke(id: string, now: Date): Promise<SportsAccessCodeRecord | undefined>;
    redeem(userId: string, codeHash: string, now: Date): Promise<
      | { ok: true; membershipExpiresAt: Date; durationDays: number }
      | { ok: false; reason: "invalid" | "expired" | "used" | "no_account" }
    >;
  };
  sportsAdGrants: {
    create(userId: string, tokenHash: string, now: Date, expiresAt: Date): Promise<SportsAdGrantRecord>;
    reserve(userId: string, tokenHash: string, now: Date): Promise<boolean>;
    complete(userId: string, tokenHash: string, now: Date): Promise<boolean>;
    release(userId: string, tokenHash: string): Promise<void>;
  };
  settings: {
    getCommissionSharingRatio(): Promise<number | null>;
    setCommissionSharingRatio(ratio: number): Promise<void>;
    getExchangeEnabled(): Promise<boolean>;
    setExchangeEnabled(enabled: boolean): Promise<void>;
    getReferralRatio(): Promise<number | null>;
    setReferralRatio(ratio: number): Promise<void>;
    getReferralEnabled(): Promise<boolean>;
    setReferralEnabled(enabled: boolean): Promise<void>;
    getOrdersTabEnabled(): Promise<boolean>; // 订单 tab 是否展示（默认开，审核时可关）
    setOrdersTabEnabled(enabled: boolean): Promise<void>;
    getSportsEnabled(): Promise<boolean>; // 运动功能是否开放（默认开）
    setSportsEnabled(enabled: boolean): Promise<void>;
    getOverrides(): Promise<Record<string, string>>;
    setMany(entries: Array<{ key: string; value: string }>): Promise<void>;
  };
  conversions: {
    create(input: Omit<ConversionRecord, "id" | "createdAt">): Promise<ConversionRecord>;
    findById(id: string): Promise<ConversionRecord | undefined>;
    listByUser(userId: string): Promise<ConversionRecord[]>;
    listByItem(itemId: string): Promise<ConversionRecord[]>;
    // 归因兜底：取时间窗内的转化（itemId 对不上时，在内存里做标题同款 bigram 匹配）
    listCreatedBetween(start: Date, end: Date, limit: number): Promise<ConversionRecord[]>;
    // 后台「查询历史」：按 商品标题/itemId/用户昵称 搜索，分页，便于人工归因兜底
    listForAdmin(options?: {
      search?: string;
      platform?: string;
      page?: number;
      pageSize?: number;
    }): Promise<{ total: number; items: ConversionAdminRecord[] }>;
  };
  copyEvents: {
    create(input: Omit<CopyEventRecord, "id" | "copiedAt">): Promise<CopyEventRecord>;
    count(): Promise<number>;
    listByItem(itemId: string): Promise<CopyEventRecord[]>;
  };
  productSnapshots: {
    find(platform: Platform, itemId: string): Promise<ProductSnapshotRecord | undefined>;
    upsert(input: UpsertProductSnapshotInput): Promise<ProductSnapshotRecord>;
  };
  orders: {
    listByUser(
      userId: string,
      options?: { page?: number; pageSize?: number; statuses?: string[] }
    ): Promise<{ total: number; items: OrderSummary[] }>;
    getRebateTotals(userId: string): Promise<{ settledPoints: number; pendingPoints: number }>;
    findById(id: string): Promise<OrderRecord | null>;
    upsert(input: UpsertOrderInput): Promise<OrderRecord>;
    upsertAttribution(input: UpsertAttributionInput): Promise<AttributionRecord>;
    getAttribution(tbkOrderId: string): Promise<{ status: string; userId: string | null } | null>;
    markOrderStatus(id: string, status: string): Promise<OrderRecord>;
    listPendingAttributions(): Promise<Array<AttributionRecord & { order: OrderRecord }>>;
    listAllOrders(options?: {
      page?: number;
      pageSize?: number;
      search?: string;
      orderStatus?: string;
      attributionStatus?: string;
    }): Promise<{
      total: number;
      items: Array<OrderRecord & { attribution: (AttributionRecord & { userNickname: string | null }) | null }>;
    }>;
    attributeOrder(id: string, input: { userId?: string | null; reviewedBy?: string }): Promise<AttributionRecord>;
    findByOrderNumber(orderNumber: string): Promise<{ order: OrderRecord; attribution: AttributionRecord | null } | undefined>;
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
    // 退款/失效：把某用户在该订单下的所有台账置为 reversed，从可用余额剔除（幂等）
    reverseOrder(userId: string, tbkOrderId: string): Promise<void>;
    // 自动兜底：订单已是终态（结算/退款/失效）但仍有 pending 台账的订单（去重到订单维度，封顶 limit）
    listStalePending(limit: number): Promise<OrderRecord[]>;
  };
  subscriptions: {
    addGrant(userId: string, templateId: string): Promise<void>;
    countUnused(userId: string, templateId: string): Promise<number>;
    listUnusedWithOpenid(templateId: string): Promise<Array<{ grantId: string; userId: string; openid: string }>>;
    markUsed(grantIds: string[]): Promise<void>;
  };
  deals: {
    list(
      publishedOnly: boolean,
      options?: { page?: number; pageSize?: number }
    ): Promise<{ total: number; items: DealPostRecord[] }>;
    findById(id: string): Promise<DealPostRecord | undefined>;
    create(input: DealPostInput): Promise<DealPostRecord>;
    update(id: string, input: DealPostInput): Promise<DealPostRecord>;
    remove(id: string): Promise<void>;
    recordView(id: string, visitorKey: string): Promise<void>;
  };
  articles: {
    list(
      publishedOnly: boolean,
      options?: { page?: number; pageSize?: number }
    ): Promise<{ total: number; items: ArticlePostRecord[] }>;
    findById(id: string): Promise<ArticlePostRecord | undefined>;
    create(input: ArticlePostInput): Promise<ArticlePostRecord>;
    update(id: string, input: ArticlePostInput): Promise<ArticlePostRecord>;
    remove(id: string): Promise<void>;
    recordView(id: string, visitorKey: string): Promise<void>;
  };
  checkIns: {
    findByUserAndDate(userId: string, checkInDate: string): Promise<CheckInRecord | undefined>;
    create(input: { userId: string; checkInDate: string; points: number }): Promise<CheckInRecord>;
    listRecentDates(userId: string, limit: number): Promise<string[]>;
    totalPoints(userId: string): Promise<number>;
  };
  withdrawals: {
    create(input: {
      userId: string;
      amountCents: number;
      payAccount: string;
      payType: string;
      notes?: string | null;
    }): Promise<WithdrawalRecord>;
    listByUser(
      userId: string,
      options?: { page?: number; pageSize?: number }
    ): Promise<{ total: number; items: WithdrawalRecord[] }>;
    getAvailableBalance(userId: string): Promise<number>;
    // 原子地校验余额并创建提现，防止并发重复提交导致超额
    createIfAffordable(input: {
      userId: string;
      amountCents: number;
      payAccount: string;
      payType: "alipay" | "wechat";
    }): Promise<{ ok: true; withdrawal: WithdrawalRecord } | { ok: false; available: number }>;
    list(status?: string): Promise<AdminWithdrawalRecord[]>;
    review(id: string, input: { status: "paid" | "rejected"; reviewedBy?: string; notes?: string | null }): Promise<WithdrawalRecord>;
  };
  syncRuns: {
    record(input: Omit<OrderSyncRunRecord, "id" | "createdAt">): Promise<void>;
    getLatest(): Promise<OrderSyncRunRecord | null>;
    tryAcquireLock(owner: string, leaseMs: number): Promise<boolean>;
    renewLock(owner: string, leaseMs: number): Promise<boolean>;
    releaseLock(owner: string): Promise<void>;
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
