CREATE TABLE `SportsVirtualPaymentOrder` (
    `id` VARCHAR(191) NOT NULL,
    `outTradeNo` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(64) NOT NULL,
    `durationDays` INTEGER NOT NULL,
    `priceCents` INTEGER NOT NULL,
    `env` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'created',
    `wxOrderId` VARCHAR(64) NULL,
    `paidAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SportsVirtualPaymentOrder_outTradeNo_key`(`outTradeNo`),
    INDEX `SportsVirtualPaymentOrder_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `SportsVirtualPaymentOrder_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SportsVirtualPaymentOrder`
  ADD CONSTRAINT `SportsVirtualPaymentOrder_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
