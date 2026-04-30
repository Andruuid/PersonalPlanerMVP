-- Migration: employee_status
-- Add explicit Employee.status with deterministic backfill.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "roleLabel" TEXT,
    "pensum" INTEGER NOT NULL,
    "entryDate" DATETIME NOT NULL,
    "exitDate" DATETIME,
    "locationId" TEXT NOT NULL,
    "vacationDaysPerYear" REAL NOT NULL DEFAULT 25,
    "weeklyTargetMinutes" INTEGER NOT NULL DEFAULT 2520,
    "hazMinutesPerWeek" INTEGER NOT NULL DEFAULT 2700,
    "tztModel" TEXT NOT NULL DEFAULT 'DAILY_QUOTA',
    "tztPeriodicQuotaDays" REAL,
    "tztPeriodMonths" INTEGER,
    "tztLastGrantedAt" DATETIME,
    "standardWorkDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'AKTIV',
    "deletedAt" DATETIME,
    "archivedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Employee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Employee" (
    "id",
    "tenantId",
    "userId",
    "firstName",
    "lastName",
    "roleLabel",
    "pensum",
    "entryDate",
    "exitDate",
    "locationId",
    "vacationDaysPerYear",
    "weeklyTargetMinutes",
    "hazMinutesPerWeek",
    "tztModel",
    "tztPeriodicQuotaDays",
    "tztPeriodMonths",
    "tztLastGrantedAt",
    "standardWorkDays",
    "isActive",
    "status",
    "deletedAt",
    "archivedUntil",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "tenantId",
    "userId",
    "firstName",
    "lastName",
    "roleLabel",
    "pensum",
    "entryDate",
    "exitDate",
    "locationId",
    "vacationDaysPerYear",
    "weeklyTargetMinutes",
    "hazMinutesPerWeek",
    "tztModel",
    "tztPeriodicQuotaDays",
    "tztPeriodMonths",
    "tztLastGrantedAt",
    "standardWorkDays",
    "isActive",
    CASE
      WHEN "deletedAt" IS NOT NULL THEN 'ARCHIVIERT'
      WHEN "exitDate" IS NOT NULL AND date("exitDate") <= date('now') THEN 'AUSGETRETEN'
      WHEN "isActive" = 0 THEN 'INAKTIV'
      ELSE 'AKTIV'
    END AS "status",
    "deletedAt",
    "archivedUntil",
    "createdAt",
    "updatedAt"
FROM "Employee";

DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
