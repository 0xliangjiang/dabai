
> server@0.1.0 prisma
> prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "openid" TEXT NOT NULL,
    "unionid" TEXT,
    "nickname" TEXT,
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Conversion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'taobao',
    "itemId" TEXT NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "itemImageUrl" TEXT,
    "itemPriceCents" INTEGER,
    "commissionRate" REAL,
    "estimatedCommissionCents" INTEGER NOT NULL DEFAULT 0,
    "estimatedRebateCents" INTEGER NOT NULL DEFAULT 0,
    "generatedPassword" TEXT NOT NULL,
    "generatedShortUrl" TEXT NOT NULL,
    "generatedClickUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CopyEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "copyType" TEXT NOT NULL,
    "copiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CopyEvent_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "Conversion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CopyEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TbkOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tbkOrderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "payTime" DATETIME NOT NULL,
    "payAmountCents" INTEGER NOT NULL,
    "estimatedCommissionCents" INTEGER NOT NULL,
    "settledCommissionCents" INTEGER,
    "orderStatus" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrderAttribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tbkOrderId" TEXT NOT NULL,
    "userId" TEXT,
    "conversionId" TEXT,
    "copyEventId" TEXT,
    "status" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderAttribution_tbkOrderId_fkey" FOREIGN KEY ("tbkOrderId") REFERENCES "TbkOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderAttribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrderAttribution_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "Conversion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrderAttribution_copyEventId_fkey" FOREIGN KEY ("copyEventId") REFERENCES "CopyEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommissionLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tbkOrderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "ledgerType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommissionLedger_tbkOrderId_fkey" FOREIGN KEY ("tbkOrderId") REFERENCES "TbkOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orderSuffix" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_openid_key" ON "User"("openid");

-- CreateIndex
CREATE INDEX "Conversion_userId_createdAt_idx" ON "Conversion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Conversion_itemId_createdAt_idx" ON "Conversion"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "CopyEvent_userId_copiedAt_idx" ON "CopyEvent"("userId", "copiedAt");

-- CreateIndex
CREATE INDEX "CopyEvent_itemId_copiedAt_idx" ON "CopyEvent"("itemId", "copiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TbkOrder_tbkOrderId_key" ON "TbkOrder"("tbkOrderId");

-- CreateIndex
CREATE INDEX "TbkOrder_itemId_payTime_idx" ON "TbkOrder"("itemId", "payTime");

-- CreateIndex
CREATE INDEX "TbkOrder_orderStatus_syncedAt_idx" ON "TbkOrder"("orderStatus", "syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAttribution_tbkOrderId_key" ON "OrderAttribution"("tbkOrderId");

-- CreateIndex
CREATE INDEX "OrderAttribution_status_createdAt_idx" ON "OrderAttribution"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderAttribution_userId_createdAt_idx" ON "OrderAttribution"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionLedger_userId_createdAt_idx" ON "CommissionLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionLedger_tbkOrderId_idx" ON "CommissionLedger"("tbkOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionLedger_userId_tbkOrderId_ledgerType_key" ON "CommissionLedger"("userId", "tbkOrderId", "ledgerType");

-- CreateIndex
CREATE INDEX "OrderClaim_userId_createdAt_idx" ON "OrderClaim"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderClaim_status_createdAt_idx" ON "OrderClaim"("status", "createdAt");

