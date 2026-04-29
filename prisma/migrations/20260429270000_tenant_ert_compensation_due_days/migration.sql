-- ERT- und Kompensations-Fristen pro Mandant
ALTER TABLE "Tenant" ADD COLUMN "ertDueDays" INTEGER NOT NULL DEFAULT 28;
ALTER TABLE "Tenant" ADD COLUMN "compensationDueDays" INTEGER NOT NULL DEFAULT 180;
