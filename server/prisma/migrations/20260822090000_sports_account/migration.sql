CREATE TABLE `SportsAccount` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `passwordCipher` TEXT NOT NULL,
  `loginTokenCipher` TEXT NULL,
  `appTokenCipher` TEXT NULL,
  `zeppUserId` VARCHAR(100) NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'awaiting_captcha',
  `bindStatus` VARCHAR(32) NOT NULL DEFAULT 'unbound',
  `captchaKey` VARCHAR(512) NULL,
  `captchaExpiresAt` DATETIME(3) NULL,
  `membershipExpiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `SportsAccount_userId_key`(`userId`),
  UNIQUE INDEX `SportsAccount_email_key`(`email`),
  UNIQUE INDEX `SportsAccount_zeppUserId_key`(`zeppUserId`),
  INDEX `SportsAccount_bindStatus_updatedAt_idx`(`bindStatus`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SportsAccount`
  ADD CONSTRAINT `SportsAccount_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
