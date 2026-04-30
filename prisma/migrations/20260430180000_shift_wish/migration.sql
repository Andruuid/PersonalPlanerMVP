-- CreateTable
CREATE TABLE "ShiftWish" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    CONSTRAINT "ShiftWish_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftWish_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftWish_preferredServiceTemplateId_fkey" FOREIGN KEY ("preferredServiceTemplateId") REFERENCES "ServiceTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ShiftWish_tenantId_status_idx" ON "ShiftWish"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ShiftWish_employeeId_date_idx" ON "ShiftWish"("employeeId", "date");

-- CreateIndex
CREATE INDEX "ShiftWish_employeeId_status_createdAt_idx" ON "ShiftWish"("employeeId", "status", "createdAt");
