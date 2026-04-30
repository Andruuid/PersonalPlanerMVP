-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShiftWish" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "preferredServiceTemplateId" TEXT,
    "preferredOneTimeLabel" TEXT,
    "oneTimeStart" TEXT,
    "oneTimeEnd" TEXT,
    "oneTimeBreakMinutes" INTEGER,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "decisionComment" TEXT,
    "decidedAt" DATETIME,
    "decidedById" TEXT,
    "deletedAt" DATETIME,
    "archivedUntil" DATETIME,
    "deletedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShiftWish_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftWish_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftWish_preferredServiceTemplateId_fkey" FOREIGN KEY ("preferredServiceTemplateId") REFERENCES "ServiceTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ShiftWish_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
INSERT INTO "new_ShiftWish" ("archivedUntil", "comment", "createdAt", "date", "decidedAt", "decidedById", "decisionComment", "deletedAt", "employeeId", "id", "oneTimeBreakMinutes", "oneTimeEnd", "oneTimeStart", "preferredOneTimeLabel", "preferredServiceTemplateId", "status", "tenantId", "updatedAt")
SELECT "archivedUntil", "comment", "createdAt", "date", "decidedAt", "decidedById", "decisionComment", "deletedAt", "employeeId", "id", "oneTimeBreakMinutes", "oneTimeEnd", "oneTimeStart", "preferredOneTimeLabel", "preferredServiceTemplateId", "status", "tenantId", "updatedAt"
FROM "ShiftWish";
DROP TABLE "ShiftWish";
ALTER TABLE "new_ShiftWish" RENAME TO "ShiftWish";
CREATE INDEX "ShiftWish_tenantId_status_idx" ON "ShiftWish"("tenantId", "status");
CREATE INDEX "ShiftWish_employeeId_date_idx" ON "ShiftWish"("employeeId", "date");
CREATE INDEX "ShiftWish_employeeId_status_createdAt_idx" ON "ShiftWish"("employeeId", "status", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
