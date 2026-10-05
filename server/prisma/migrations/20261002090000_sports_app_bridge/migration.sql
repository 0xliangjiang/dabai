CREATE TABLE `SportsIdentity` (
  `id` VARCHAR(191) NOT NULL,
  `appId` VARCHAR(64) NOT NULL,
  `openid` VARCHAR(128) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SportsIdentity_appId_openid_key` (`appId`, `openid`),
  UNIQUE INDEX `SportsIdentity_appId_userId_key` (`appId`, `userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SportsIdentity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `SportsHandoff` (
  `tokenHash` CHAR(64) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `appId` VARCHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  INDEX `SportsHandoff_expiresAt_idx` (`expiresAt`),
  PRIMARY KEY (`tokenHash`),
  CONSTRAINT `SportsHandoff_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
