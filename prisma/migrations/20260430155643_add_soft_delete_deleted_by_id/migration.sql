-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AbsenceRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "comment" TEXT,
    "decisionComment" TEXT,
    "decidedAt" DATETIME,
    "decidedById" TEXT,
    "deletedAt" DATETIME,
    "archivedUntil" DATETIME,
    "deletedById" TEXT,
    "cancelledAt" DATETIME,
    "cancelledById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AbsenceRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AbsenceRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AbsenceRequest_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "AbsenceRequest_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AbsenceRequest" ("archivedUntil", "cancelledAt", "cancelledById", "comment", "createdAt", "decidedAt", "decidedById", "decisionComment", "deletedAt", "employeeId", "endDate", "id", "startDate", "status", "tenantId", "type", "updatedAt") SELECT "archivedUntil", "cancelledAt", "cancelledById", "comment", "createdAt", "decidedAt", "decidedById", "decisionComment", "deletedAt", "employeeId", "endDate", "id", "startDate", "status", "tenantId", "type", "updatedAt" FROM "AbsenceRequest";
DROP TABLE "AbsenceRequest";
ALTER TABLE "new_AbsenceRequest" RENAME TO "AbsenceRequest";
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
    "deletedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Employee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Employee_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("archivedUntil", "createdAt", "deletedAt", "entryDate", "exitDate", "firstName", "hazMinutesPerWeek", "id", "isActive", "lastName", "locationId", "pensum", "roleLabel", "standardWorkDays", "status", "tenantId", "tztLastGrantedAt", "tztModel", "tztPeriodMonths", "tztPeriodicQuotaDays", "updatedAt", "userId", "vacationDaysPerYear", "weeklyTargetMinutes") SELECT "archivedUntil", "createdAt", "deletedAt", "entryDate", "exitDate", "firstName", "hazMinutesPerWeek", "id", "isActive", "lastName", "locationId", "pensum", "roleLabel", "standardWorkDays", "status", "tenantId", "tztLastGrantedAt", "tztModel", "tztPeriodMonths", "tztPeriodicQuotaDays", "updatedAt", "userId", "vacationDaysPerYear", "weeklyTargetMinutes" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
CREATE TABLE "new_Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "holidayRegionCode" TEXT NOT NULL,
    "deletedAt" DATETIME,
    "archivedUntil" DATETIME,
    "deletedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Location_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Location_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
INSERT INTO "new_Location" ("archivedUntil", "createdAt", "deletedAt", "holidayRegionCode", "id", "name", "tenantId", "updatedAt") SELECT "archivedUntil", "createdAt", "deletedAt", "holidayRegionCode", "id", "name", "tenantId", "updatedAt" FROM "Location";
DROP TABLE "Location";
ALTER TABLE "new_Location" RENAME TO "Location";
CREATE TABLE "new_PlanEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "kind" TEXT NOT NULL,
    "serviceTemplateId" TEXT,
    "oneTimeStart" TEXT,
    "oneTimeEnd" TEXT,
    "oneTimeBreakMinutes" INTEGER,
    "oneTimeLabel" TEXT,
    "absenceType" TEXT,
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT,
    "deletedAt" DATETIME,
    "archivedUntil" DATETIME,
    "deletedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanEntry_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanEntry_serviceTemplateId_fkey" FOREIGN KEY ("serviceTemplateId") REFERENCES "ServiceTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanEntry_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
INSERT INTO "new_PlanEntry" ("absenceType", "archivedUntil", "comment", "createdAt", "date", "deletedAt", "employeeId", "id", "kind", "oneTimeBreakMinutes", "oneTimeEnd", "oneTimeLabel", "oneTimeStart", "plannedMinutes", "serviceTemplateId", "updatedAt", "weekId") SELECT "absenceType", "archivedUntil", "comment", "createdAt", "date", "deletedAt", "employeeId", "id", "kind", "oneTimeBreakMinutes", "oneTimeEnd", "oneTimeLabel", "oneTimeStart", "plannedMinutes", "serviceTemplateId", "updatedAt", "weekId" FROM "PlanEntry";
DROP TABLE "PlanEntry";
ALTER TABLE "new_PlanEntry" RENAME TO "PlanEntry";
CREATE INDEX "PlanEntry_weekId_employeeId_date_idx" ON "PlanEntry"("weekId", "employeeId", "date");
CREATE TABLE "new_ServiceTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 30,
    "comment" TEXT,
    "defaultDays" INTEGER,
    "requiredCount" INTEGER,
    "blockColorHex" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "archivedUntil" DATETIME,
    "deletedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceTemplate_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
INSERT INTO "new_ServiceTemplate" ("archivedUntil", "blockColorHex", "breakMinutes", "code", "comment", "createdAt", "defaultDays", "deletedAt", "endTime", "id", "isActive", "name", "requiredCount", "startTime", "tenantId", "updatedAt") SELECT "archivedUntil", "blockColorHex", "breakMinutes", "code", "comment", "createdAt", "defaultDays", "deletedAt", "endTime", "id", "isActive", "name", "requiredCount", "startTime", "tenantId", "updatedAt" FROM "ServiceTemplate";
DROP TABLE "ServiceTemplate";
ALTER TABLE "new_ServiceTemplate" RENAME TO "ServiceTemplate";
CREATE UNIQUE INDEX "ServiceTemplate_tenantId_code_key" ON "ServiceTemplate"("tenantId", "code");
CREATE TABLE "new_Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "defaultStandardWorkDays" INTEGER NOT NULL DEFAULT 5,
    "defaultWeeklyTargetMinutes" INTEGER NOT NULL DEFAULT 2520,
    "defaultHazMinutesPerWeek" INTEGER NOT NULL DEFAULT 2700,
    "zeitsaldoMinLimitMinutes" INTEGER,
    "uezPayoutPolicy" TEXT NOT NULL DEFAULT 'ALLOWED',
    "ertDueDays" INTEGER NOT NULL DEFAULT 28,
    "compensationDueDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "archivedUntil" DATETIME,
    "deletedById" TEXT,
    CONSTRAINT "Tenant_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
INSERT INTO "new_Tenant" ("archivedUntil", "compensationDueDays", "createdAt", "defaultHazMinutesPerWeek", "defaultStandardWorkDays", "defaultWeeklyTargetMinutes", "deletedAt", "ertDueDays", "id", "name", "slug", "uezPayoutPolicy", "zeitsaldoMinLimitMinutes") SELECT "archivedUntil", "compensationDueDays", "createdAt", "defaultHazMinutesPerWeek", "defaultStandardWorkDays", "defaultWeeklyTargetMinutes", "deletedAt", "ertDueDays", "id", "name", "slug", "uezPayoutPolicy", "zeitsaldoMinLimitMinutes" FROM "Tenant";
DROP TABLE "Tenant";
ALTER TABLE "new_Tenant" RENAME TO "Tenant";
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE TABLE "new_Week" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" DATETIME,
    "closedAt" DATETIME,
    "deletedAt" DATETIME,
    "archivedUntil" DATETIME,
    "deletedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Week_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Week_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
INSERT INTO "new_Week" ("archivedUntil", "closedAt", "createdAt", "deletedAt", "id", "publishedAt", "status", "tenantId", "updatedAt", "weekNumber", "year") SELECT "archivedUntil", "closedAt", "createdAt", "deletedAt", "id", "publishedAt", "status", "tenantId", "updatedAt", "weekNumber", "year" FROM "Week";
DROP TABLE "Week";
ALTER TABLE "new_Week" RENAME TO "Week";
CREATE UNIQUE INDEX "Week_tenantId_year_weekNumber_key" ON "Week"("tenantId", "year", "weekNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
