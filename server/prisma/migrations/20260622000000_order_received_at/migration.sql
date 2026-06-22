-- AlterTable: 记录订单首次「已收货」时间，用于大额佣金延迟结算计时
ALTER TABLE `TbkOrder` ADD COLUMN `receivedAt` DATETIME(3) NULL;
