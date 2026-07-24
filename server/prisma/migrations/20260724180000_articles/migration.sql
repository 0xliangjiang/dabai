-- CreateTable
CREATE TABLE `ArticlePost` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `summary` VARCHAR(512) NULL,
    `coverUrl` VARCHAR(1024) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `blocks` JSON NOT NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ArticlePost_status_pinned_publishedAt_idx`(`status`, `pinned`, `publishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ArticleVisit` (
    `id` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NOT NULL,
    `visitorKey` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ArticleVisit_articleId_idx`(`articleId`),
    UNIQUE INDEX `ArticleVisit_articleId_visitorKey_key`(`articleId`, `visitorKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ArticleVisit`
ADD CONSTRAINT `ArticleVisit_articleId_fkey`
FOREIGN KEY (`articleId`) REFERENCES `ArticlePost`(`id`)
ON DELETE CASCADE ON UPDATE CASCADE;
