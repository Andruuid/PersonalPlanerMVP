-- AlterTable
ALTER TABLE "Location" ADD COLUMN "archivedUntil" DATETIME;
ALTER TABLE "Location" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "PlanEntry" ADD COLUMN "archivedUntil" DATETIME;
ALTER TABLE "PlanEntry" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Week" ADD COLUMN "archivedUntil" DATETIME;
ALTER TABLE "Week" ADD COLUMN "deletedAt" DATETIME;

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrivacyRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrivacyRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "comment", "createdAt", "entity", "entityId", "id", "newValue", "oldValue", "userId") SELECT "action", "comment", "createdAt", "entity", "entityId", "id", "newValue", "oldValue", "userId" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE TABLE "new_Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "archivedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Employee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("createdAt", "entryDate", "exitDate", "firstName", "hazMinutesPerWeek", "id", "isActive", "lastName", "locationId", "pensum", "roleLabel", "tztModel", "updatedAt", "userId", "vacationDaysPerYear", "weeklyTargetMinutes") SELECT "createdAt", "entryDate", "exitDate", "firstName", "hazMinutesPerWeek", "id", "isActive", "lastName", "locationId", "pensum", "roleLabel", "tztModel", "updatedAt", "userId", "vacationDaysPerYear", "weeklyTargetMinutes" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PrivacyRequest_employeeId_createdAt_idx" ON "PrivacyRequest"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "PrivacyRequest_status_type_idx" ON "PrivacyRequest"("status", "type");
