CREATE TABLE `SportsDailyTarget` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `targetDate` VARCHAR(10) NOT NULL,
  `steps` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `SportsDailyTarget_userId_targetDate_key`(`userId`, `targetDate`),
  INDEX `SportsDailyTarget_targetDate_updatedAt_idx`(`targetDate`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SportsDailyTarget`
  ADD CONSTRAINT `SportsDailyTarget_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
