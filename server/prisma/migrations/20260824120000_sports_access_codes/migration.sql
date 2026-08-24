CREATE TABLE `SportsAccessCode` (
  `id` VARCHAR(191) NOT NULL,
  `codeHash` CHAR(64) NOT NULL,
  `codeHint` VARCHAR(24) NOT NULL,
  `batchId` VARCHAR(36) NOT NULL,
  `durationDays` INTEGER NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `validUntil` DATETIME(3) NULL,
  `redeemedByUserId` VARCHAR(191) NULL,
  `redeemedAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `SportsAccessCode_codeHash_key`(`codeHash`),
  INDEX `SportsAccessCode_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `SportsAccessCode_batchId_idx`(`batchId`),
  INDEX `SportsAccessCode_redeemedByUserId_redeemedAt_idx`(`redeemedByUserId`, `redeemedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SportsAccessCode`
  ADD CONSTRAINT `SportsAccessCode_redeemedByUserId_fkey`
  FOREIGN KEY (`redeemedByUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
