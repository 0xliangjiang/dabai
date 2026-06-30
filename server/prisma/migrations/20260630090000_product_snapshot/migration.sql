CREATE TABLE `ProductSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL DEFAULT 'taobao',
    `itemId` VARCHAR(191) NOT NULL,
    `itemTitle` VARCHAR(512) NOT NULL,
    `itemImageUrl` VARCHAR(1024) NULL,
    `itemPriceCents` INTEGER NULL,
    `rawPayload` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductSnapshot_platform_itemId_key`(`platform`, `itemId`),
    INDEX `ProductSnapshot_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
