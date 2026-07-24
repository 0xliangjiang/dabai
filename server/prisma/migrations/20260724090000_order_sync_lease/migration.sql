CREATE TABLE `OrderSyncLease` (
    `key` VARCHAR(64) NOT NULL,
    `owner` VARCHAR(64) NOT NULL,
    `leaseUntil` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
