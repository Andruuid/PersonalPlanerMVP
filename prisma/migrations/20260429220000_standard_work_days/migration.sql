-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "defaultStandardWorkDays" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "standardWorkDays" INTEGER;
