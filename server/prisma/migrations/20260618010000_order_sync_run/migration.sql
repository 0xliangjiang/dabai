-- CreateTable: 订单同步记录（每次同步跑完追加一条，后台只读最新一条）
CREATE TABLE `OrderSyncRun` (
    `id` VARCHAR(191) NOT NULL,
    `trigger` VARCHAR(191) NOT NULL,
    `ok` BOOLEAN NOT NULL,
    `taobaoSynced` INTEGER NOT NULL DEFAULT 0,
    `taobaoAttributed` INTEGER NOT NULL DEFAULT 0,
    `jdSynced` INTEGER NOT NULL DEFAULT 0,
    `jdAttributed` INTEGER NOT NULL DEFAULT 0,
    `errorMessage` VARCHAR(1024) NULL,
    `durationMs` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrderSyncRun_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
