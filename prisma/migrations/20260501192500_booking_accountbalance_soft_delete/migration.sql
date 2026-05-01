-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_AccountBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "openingValue" REAL NOT NULL DEFAULT 0,
    "currentValue" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "deletedAt" DATETIME,
    "archivedUntil" DATETIME,
    "deletedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountBalance_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
INSERT INTO "new_AccountBalance" ("accountType", "currentValue", "employeeId", "id", "openingValue", "tenantId", "unit", "updatedAt", "year")
SELECT "accountType", "currentValue", "employeeId", "id", "openingValue", "tenantId", "unit", "updatedAt", "year" FROM "AccountBalance";
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
    "deletedAt" DATETIME,
    "archivedUntil" DATETIME,
    "deletedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("accountType", "bookingType", "comment", "createdAt", "createdByUserId", "date", "employeeId", "id", "tenantId", "value")
SELECT "accountType", "bookingType", "comment", "createdAt", "createdByUserId", "date", "employeeId", "id", "tenantId", "value" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_employeeId_accountType_date_idx" ON "Booking"("employeeId", "accountType", "date");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
