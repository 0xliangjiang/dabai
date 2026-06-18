-- AlterTable: 二级分销——用户邀请人（上线）
ALTER TABLE `User` ADD COLUMN `inviterId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `User_inviterId_idx` ON `User`(`inviterId`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_inviterId_fkey` FOREIGN KEY (`inviterId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
