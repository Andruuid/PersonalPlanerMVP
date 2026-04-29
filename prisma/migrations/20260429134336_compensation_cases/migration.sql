-- CreateTable
CREATE TABLE "CompensationCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
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

-- CreateIndex
CREATE INDEX "CompensationCase_employeeId_status_dueAt_idx" ON "CompensationCase"("employeeId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompensationCase_employeeId_triggerDate_key" ON "CompensationCase"("employeeId", "triggerDate");
