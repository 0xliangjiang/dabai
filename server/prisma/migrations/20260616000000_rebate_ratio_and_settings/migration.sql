-- AlterTable: 用户级返利比例（空表示用全局）
ALTER TABLE `User` ADD COLUMN `rebateRatio` DOUBLE NULL;

-- CreateTable: 全局设置键值表（如全局返利比例，可后台热改）
CREATE TABLE `Setting` (
    `key` VARCHAR(64) NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
