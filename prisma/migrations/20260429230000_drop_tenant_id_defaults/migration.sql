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
    "decidedAt" DATETIME,
    "decidedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AbsenceRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AbsenceRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AbsenceRequest" ("comment", "createdAt", "decidedAt", "decidedById", "employeeId", "endDate", "id", "startDate", "status", "tenantId", "type", "updatedAt") SELECT "comment", "createdAt", "decidedAt", "decidedById", "employeeId", "endDate", "id", "startDate", "status", "tenantId", "type", "updatedAt" FROM "AbsenceRequest";
DROP TABLE "AbsenceRequest";
ALTER TABLE "new_AbsenceRequest" RENAME TO "AbsenceRequest";
CREATE TABLE "new_AccountBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "openingValue" REAL NOT NULL DEFAULT 0,
    "currentValue" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AccountBalance" ("accountType", "currentValue", "employeeId", "id", "openingValue", "tenantId", "unit", "updatedAt", "year") SELECT "accountType", "currentValue", "employeeId", "id", "openingValue", "tenantId", "unit", "updatedAt", "year" FROM "AccountBalance";
DROP TABLE "AccountBalance";
ALTER TABLE "new_AccountBalance" RENAME TO "AccountBalance";
CREATE UNIQUE INDEX "AccountBalance_employeeId_accountType_year_key" ON "AccountBalance"("employeeId", "accountType", "year");
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "value" REAL NOT NULL,
    "bookingType" TEXT NOT NULL,
    "comment" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("accountType", "bookingType", "comment", "createdAt", "createdByUserId", "date", "employeeId", "id", "tenantId", "value") SELECT "accountType", "bookingType", "comment", "createdAt", "createdByUserId", "date", "employeeId", "id", "tenantId", "value" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_employeeId_accountType_date_idx" ON "Booking"("employeeId", "accountType", "date");
CREATE TABLE "new_CompensationCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "triggerDate" DATETIME NOT NULL,
    "holidayWorkMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueAt" DATETIME NOT NULL,
    "redeemedAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompensationCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompensationCase_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CompensationCase" ("createdAt", "dueAt", "employeeId", "holidayWorkMinutes", "id", "note", "redeemedAt", "status", "tenantId", "triggerDate", "updatedAt") SELECT "createdAt", "dueAt", "employeeId", "holidayWorkMinutes", "id", "note", "redeemedAt", "status", "tenantId", "triggerDate", "updatedAt" FROM "CompensationCase";
DROP TABLE "CompensationCase";
ALTER TABLE "new_CompensationCase" RENAME TO "CompensationCase";
CREATE INDEX "CompensationCase_employeeId_status_dueAt_idx" ON "CompensationCase"("employeeId", "status", "dueAt");
CREATE UNIQUE INDEX "CompensationCase_employeeId_triggerDate_key" ON "CompensationCase"("employeeId", "triggerDate");
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
    "standardWorkDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "archivedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Employee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("archivedUntil", "createdAt", "deletedAt", "entryDate", "exitDate", "firstName", "hazMinutesPerWeek", "id", "isActive", "lastName", "locationId", "pensum", "roleLabel", "standardWorkDays", "tenantId", "tztModel", "updatedAt", "userId", "vacationDaysPerYear", "weeklyTargetMinutes") SELECT "archivedUntil", "createdAt", "deletedAt", "entryDate", "exitDate", "firstName", "hazMinutesPerWeek", "id", "isActive", "lastName", "locationId", "pensum", "roleLabel", "standardWorkDays", "tenantId", "tztModel", "updatedAt", "userId", "vacationDaysPerYear", "weeklyTargetMinutes" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
CREATE TABLE "new_EmployeeExitSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "exitDate" DATETIME NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeExitSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EmployeeExitSnapshot_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EmployeeExitSnapshot" ("createdAt", "employeeId", "exitDate", "id", "snapshotJson", "tenantId") SELECT "createdAt", "employeeId", "exitDate", "id", "snapshotJson", "tenantId" FROM "EmployeeExitSnapshot";
DROP TABLE "EmployeeExitSnapshot";
ALTER TABLE "new_EmployeeExitSnapshot" RENAME TO "EmployeeExitSnapshot";
CREATE UNIQUE INDEX "EmployeeExitSnapshot_employeeId_key" ON "EmployeeExitSnapshot"("employeeId");
CREATE INDEX "EmployeeExitSnapshot_tenantId_idx" ON "EmployeeExitSnapshot"("tenantId");
CREATE TABLE "new_ErtCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "triggerDate" DATETIME NOT NULL,
    "holidayWorkMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueAt" DATETIME NOT NULL,
    "fulfilledAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ErtCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ErtCase_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ErtCase" ("createdAt", "dueAt", "employeeId", "fulfilledAt", "holidayWorkMinutes", "id", "note", "status", "tenantId", "triggerDate", "updatedAt") SELECT "createdAt", "dueAt", "employeeId", "fulfilledAt", "holidayWorkMinutes", "id", "note", "status", "tenantId", "triggerDate", "updatedAt" FROM "ErtCase";
DROP TABLE "ErtCase";
ALTER TABLE "new_ErtCase" RENAME TO "ErtCase";
CREATE INDEX "ErtCase_employeeId_status_dueAt_idx" ON "ErtCase"("employeeId", "status", "dueAt");
CREATE UNIQUE INDEX "ErtCase_employeeId_triggerDate_key" ON "ErtCase"("employeeId", "triggerDate");
CREATE TABLE "new_Holiday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Holiday_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Holiday_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Holiday" ("createdAt", "date", "id", "locationId", "name", "tenantId") SELECT "createdAt", "date", "id", "locationId", "name", "tenantId" FROM "Holiday";
DROP TABLE "Holiday";
ALTER TABLE "new_Holiday" RENAME TO "Holiday";
CREATE UNIQUE INDEX "Holiday_locationId_date_key" ON "Holiday"("locationId", "date");
CREATE TABLE "new_Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "holidayRegionCode" TEXT NOT NULL,
    "deletedAt" DATETIME,
    "archivedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Location_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Location" ("archivedUntil", "createdAt", "deletedAt", "holidayRegionCode", "id", "name", "tenantId", "updatedAt") SELECT "archivedUntil", "createdAt", "deletedAt", "holidayRegionCode", "id", "name", "tenantId", "updatedAt" FROM "Location";
DROP TABLE "Location";
ALTER TABLE "new_Location" RENAME TO "Location";
CREATE TABLE "new_PrivacyRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrivacyRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrivacyRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrivacyRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PrivacyRequest" ("createdAt", "decidedAt", "decidedById", "employeeId", "id", "note", "status", "tenantId", "type", "updatedAt") SELECT "createdAt", "decidedAt", "decidedById", "employeeId", "id", "note", "status", "tenantId", "type", "updatedAt" FROM "PrivacyRequest";
DROP TABLE "PrivacyRequest";
ALTER TABLE "new_PrivacyRequest" RENAME TO "PrivacyRequest";
CREATE INDEX "PrivacyRequest_employeeId_createdAt_idx" ON "PrivacyRequest"("employeeId", "createdAt");
CREATE INDEX "PrivacyRequest_status_type_idx" ON "PrivacyRequest"("status", "type");
CREATE TABLE "new_PublishedSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublishedSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PublishedSnapshot_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PublishedSnapshot" ("id", "publishedAt", "snapshotJson", "tenantId", "weekId") SELECT "id", "publishedAt", "snapshotJson", "tenantId", "weekId" FROM "PublishedSnapshot";
DROP TABLE "PublishedSnapshot";
ALTER TABLE "new_PublishedSnapshot" RENAME TO "PublishedSnapshot";
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
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ServiceTemplate" ("breakMinutes", "code", "comment", "createdAt", "defaultDays", "endTime", "id", "isActive", "name", "requiredCount", "startTime", "tenantId", "updatedAt") SELECT "breakMinutes", "code", "comment", "createdAt", "defaultDays", "endTime", "id", "isActive", "name", "requiredCount", "startTime", "tenantId", "updatedAt" FROM "ServiceTemplate";
DROP TABLE "ServiceTemplate";
ALTER TABLE "new_ServiceTemplate" RENAME TO "ServiceTemplate";
CREATE UNIQUE INDEX "ServiceTemplate_tenantId_code_key" ON "ServiceTemplate"("tenantId", "code");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "id", "isActive", "passwordHash", "role", "tenantId", "updatedAt") SELECT "createdAt", "email", "id", "isActive", "passwordHash", "role", "tenantId", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Week_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Week" ("archivedUntil", "closedAt", "createdAt", "deletedAt", "id", "publishedAt", "status", "tenantId", "updatedAt", "weekNumber", "year") SELECT "archivedUntil", "closedAt", "createdAt", "deletedAt", "id", "publishedAt", "status", "tenantId", "updatedAt", "weekNumber", "year" FROM "Week";
DROP TABLE "Week";
ALTER TABLE "new_Week" RENAME TO "Week";
CREATE UNIQUE INDEX "Week_tenantId_year_weekNumber_key" ON "Week"("tenantId", "year", "weekNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
