-- AlterTable: 线报点击量（PV）
ALTER TABLE `DealPost` ADD COLUMN `viewCount` INTEGER NOT NULL DEFAULT 0;

-- CreateTable: 线报访问去重（UV，按设备 visitorKey 去重）
CREATE TABLE `DealVisit` (
    `id` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NOT NULL,
    `visitorKey` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DealVisit_dealId_visitorKey_key`(`dealId`, `visitorKey`),
    INDEX `DealVisit_dealId_idx`(`dealId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DealVisit` ADD CONSTRAINT `DealVisit_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `DealPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
