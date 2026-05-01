-- Admin-only correction of effective actual minutes for week close.
-- Adds the four corrected-actual fields to PlanEntry. Schema change was
-- introduced in commit 62977a5 ("Add Actual-Time / Correction Model")
-- without a migration, which caused CI to fail with
-- "no such column: main.PlanEntry.correctedActualMinutes" on /planning.
ALTER TABLE "PlanEntry" ADD COLUMN "correctedActualMinutes" INTEGER;
ALTER TABLE "PlanEntry" ADD COLUMN "correctedActualComment" TEXT;
ALTER TABLE "PlanEntry" ADD COLUMN "correctedActualAt" DATETIME;
ALTER TABLE "PlanEntry" ADD COLUMN "correctedActualByUserId" TEXT;
