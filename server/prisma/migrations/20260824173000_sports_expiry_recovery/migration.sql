ALTER TABLE `User`
  ADD COLUMN `sportsInviteRewardedAt` DATETIME(3) NULL;

CREATE TABLE `SportsAdGrant` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `expiresAt` DATETIME(3) NOT NULL,
  `reservedAt` DATETIME(3) NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `SportsAdGrant_tokenHash_key`(`tokenHash`),
  INDEX `SportsAdGrant_userId_status_expiresAt_idx`(`userId`, `status`, `expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SportsAdGrant`
  ADD CONSTRAINT `SportsAdGrant_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
