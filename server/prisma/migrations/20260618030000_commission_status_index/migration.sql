-- CreateIndex: 加速余额/二级提成的 (userId, status) 聚合查询
CREATE INDEX `CommissionLedger_userId_status_idx` ON `CommissionLedger`(`userId`, `status`);
