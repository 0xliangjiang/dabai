-- CheckIn.points uses 0.01 point as its integer storage unit.
-- 这里的缩放只为支持最小 0.01 奖励值并避免存储浮点数。
-- Preserve historical balances: 5 old points become 500 storage units = 5 points.
UPDATE `CheckIn`
SET `points` = `points` * 100;
