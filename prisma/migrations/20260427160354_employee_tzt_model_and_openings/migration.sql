-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Employee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("createdAt", "entryDate", "exitDate", "firstName", "hazMinutesPerWeek", "id", "isActive", "lastName", "locationId", "pensum", "roleLabel", "updatedAt", "userId", "vacationDaysPerYear", "weeklyTargetMinutes") SELECT "createdAt", "entryDate", "exitDate", "firstName", "hazMinutesPerWeek", "id", "isActive", "lastName", "locationId", "pensum", "roleLabel", "updatedAt", "userId", "vacationDaysPerYear", "weeklyTargetMinutes" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
