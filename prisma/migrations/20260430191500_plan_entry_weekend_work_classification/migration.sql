-- Distinguish regular shifted weekend work vs additional weekend work.
ALTER TABLE "PlanEntry"
ADD COLUMN "weekendWorkClassification" TEXT;

-- Backfill existing weekend work rows to preserve current behavior.
UPDATE "PlanEntry"
SET "weekendWorkClassification" = 'REGULAR_SHIFTED'
WHERE "kind" IN ('SHIFT', 'ONE_TIME_SHIFT')
  AND (
    CAST(strftime('%w', "date") AS INTEGER) = 0
    OR CAST(strftime('%w', "date") AS INTEGER) = 6
  );
