-- AlterTable: 后台手动标记的订单状态（已收货/已结算），同步时与折淘客状态取更靠后者
ALTER TABLE `TbkOrder` ADD COLUMN `manualStatus` VARCHAR(191) NULL;
