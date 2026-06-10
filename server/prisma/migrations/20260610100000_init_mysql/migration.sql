-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `openid` VARCHAR(191) NOT NULL,
    `unionid` VARCHAR(191) NULL,
    `nickname` VARCHAR(191) NULL,
    `avatarUrl` VARCHAR(512) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_openid_key`(`openid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CheckIn` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `checkInDate` VARCHAR(191) NOT NULL,
    `points` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CheckIn_userId_createdAt_idx`(`userId`, `createdAt`),
    UNIQUE INDEX `CheckIn_userId_checkInDate_key`(`userId`, `checkInDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Conversion` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `rawContent` TEXT NOT NULL,
    `platform` VARCHAR(191) NOT NULL DEFAULT 'taobao',
    `itemId` VARCHAR(191) NOT NULL,
    `itemTitle` VARCHAR(512) NOT NULL,
    `itemImageUrl` VARCHAR(1024) NULL,
    `itemPriceCents` INTEGER NULL,
    `commissionRate` DOUBLE NULL,
    `estimatedCommissionCents` INTEGER NOT NULL DEFAULT 0,
    `estimatedRebateCents` INTEGER NOT NULL DEFAULT 0,
    `generatedPassword` VARCHAR(512) NOT NULL,
    `generatedShortUrl` VARCHAR(1024) NOT NULL,
    `generatedClickUrl` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Conversion_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `Conversion_itemId_createdAt_idx`(`itemId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CopyEvent` (
    `id` VARCHAR(191) NOT NULL,
    `conversionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `copyType` VARCHAR(191) NOT NULL,
    `copiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CopyEvent_userId_copiedAt_idx`(`userId`, `copiedAt`),
    INDEX `CopyEvent_itemId_copiedAt_idx`(`itemId`, `copiedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TbkOrder` (
    `id` VARCHAR(191) NOT NULL,
    `tbkOrderId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `itemTitle` VARCHAR(512) NOT NULL,
    `payTime` DATETIME(3) NOT NULL,
    `payAmountCents` INTEGER NOT NULL,
    `estimatedCommissionCents` INTEGER NOT NULL,
    `settledCommissionCents` INTEGER NULL,
    `orderStatus` VARCHAR(191) NOT NULL,
    `rawPayload` JSON NOT NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TbkOrder_tbkOrderId_key`(`tbkOrderId`),
    INDEX `TbkOrder_itemId_payTime_idx`(`itemId`, `payTime`),
    INDEX `TbkOrder_orderStatus_syncedAt_idx`(`orderStatus`, `syncedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderAttribution` (
    `id` VARCHAR(191) NOT NULL,
    `tbkOrderId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `conversionId` VARCHAR(191) NULL,
    `copyEventId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL,
    `confidence` DOUBLE NOT NULL,
    `reason` VARCHAR(512) NOT NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrderAttribution_tbkOrderId_key`(`tbkOrderId`),
    INDEX `OrderAttribution_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `OrderAttribution_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommissionLedger` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tbkOrderId` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `ledgerType` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(512) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CommissionLedger_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `CommissionLedger_tbkOrderId_idx`(`tbkOrderId`),
    UNIQUE INDEX `CommissionLedger_userId_tbkOrderId_ledgerType_key`(`userId`, `tbkOrderId`, `ledgerType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderClaim` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `orderSuffix` VARCHAR(191) NOT NULL,
    `screenshotUrl` VARCHAR(1024) NULL,
    `notes` VARCHAR(1024) NULL,
    `status` VARCHAR(191) NOT NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OrderClaim_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `OrderClaim_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DealPost` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `summary` VARCHAR(512) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `steps` JSON NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DealPost_status_pinned_publishedAt_idx`(`status`, `pinned`, `publishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscribeGrant` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SubscribeGrant_templateId_used_idx`(`templateId`, `used`),
    INDEX `SubscribeGrant_userId_used_idx`(`userId`, `used`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemConfig` (
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CheckIn` ADD CONSTRAINT `CheckIn_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversion` ADD CONSTRAINT `Conversion_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CopyEvent` ADD CONSTRAINT `CopyEvent_conversionId_fkey` FOREIGN KEY (`conversionId`) REFERENCES `Conversion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CopyEvent` ADD CONSTRAINT `CopyEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderAttribution` ADD CONSTRAINT `OrderAttribution_tbkOrderId_fkey` FOREIGN KEY (`tbkOrderId`) REFERENCES `TbkOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderAttribution` ADD CONSTRAINT `OrderAttribution_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderAttribution` ADD CONSTRAINT `OrderAttribution_conversionId_fkey` FOREIGN KEY (`conversionId`) REFERENCES `Conversion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderAttribution` ADD CONSTRAINT `OrderAttribution_copyEventId_fkey` FOREIGN KEY (`copyEventId`) REFERENCES `CopyEvent`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommissionLedger` ADD CONSTRAINT `CommissionLedger_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommissionLedger` ADD CONSTRAINT `CommissionLedger_tbkOrderId_fkey` FOREIGN KEY (`tbkOrderId`) REFERENCES `TbkOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderClaim` ADD CONSTRAINT `OrderClaim_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubscribeGrant` ADD CONSTRAINT `SubscribeGrant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

