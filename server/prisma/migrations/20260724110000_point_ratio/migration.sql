-- PointAdjustment.amountCents historically stored the entered point count.
-- With 1 point = 1 yuan, convert those existing adjustments to monetary cents.
UPDATE `PointAdjustment`
SET `amountCents` = `amountCents` * 100;
