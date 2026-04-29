-- CreateTable
CREATE TABLE "ErtCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "triggerDate" DATETIME NOT NULL,
    "holidayWorkMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueAt" DATETIME NOT NULL,
    "fulfilledAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ErtCase_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ErtCase_employeeId_triggerDate_key" ON "ErtCase"("employeeId", "triggerDate");

-- CreateIndex
CREATE INDEX "ErtCase_employeeId_status_dueAt_idx" ON "ErtCase"("employeeId", "status", "dueAt");
