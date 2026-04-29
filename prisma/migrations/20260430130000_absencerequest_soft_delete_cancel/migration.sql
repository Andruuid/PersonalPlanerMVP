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
    "cancelledAt" DATETIME,
    "cancelledById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AbsenceRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AbsenceRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AbsenceRequest_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AbsenceRequest" ("comment", "createdAt", "decidedAt", "decidedById", "decisionComment", "employeeId", "endDate", "id", "startDate", "status", "tenantId", "type", "updatedAt") SELECT "comment", "createdAt", "decidedAt", "decidedById", "decisionComment", "employeeId", "endDate", "id", "startDate", "status", "tenantId", "type", "updatedAt" FROM "AbsenceRequest";
DROP TABLE "AbsenceRequest";
ALTER TABLE "new_AbsenceRequest" RENAME TO "AbsenceRequest";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
