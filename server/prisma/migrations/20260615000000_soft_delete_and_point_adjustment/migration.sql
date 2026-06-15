-- AlterTable: 用户软删除标记
ALTER TABLE `User` ADD COLUMN `deletedAt` DATETIME(3) NULL;

-- CreateTable: 管理员手动积分调整
CREATE TABLE `PointAdjustment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `reason` VARCHAR(512) NOT NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PointAdjustment_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PointAdjustment` ADD CONSTRAINT `PointAdjustment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
