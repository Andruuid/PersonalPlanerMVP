-- Tenant-Stammdaten: Vollzeit-/HAZ-Vorschlagswerte, Zeitsaldo-Mindestgrenze, UEZ-Auszahlungspolitik
ALTER TABLE "Tenant" ADD COLUMN "defaultWeeklyTargetMinutes" INTEGER NOT NULL DEFAULT 2520;
ALTER TABLE "Tenant" ADD COLUMN "defaultHazMinutesPerWeek" INTEGER NOT NULL DEFAULT 2700;
ALTER TABLE "Tenant" ADD COLUMN "zeitsaldoMinLimitMinutes" INTEGER;
ALTER TABLE "Tenant" ADD COLUMN "uezPayoutPolicy" TEXT NOT NULL DEFAULT 'ALLOWED';
