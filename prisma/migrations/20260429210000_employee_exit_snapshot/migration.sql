-- CreateTable
CREATE TABLE "EmployeeExitSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "employeeId" TEXT NOT NULL,
    "exitDate" DATETIME NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeExitSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EmployeeExitSnapshot_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeExitSnapshot_employeeId_key" ON "EmployeeExitSnapshot"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeExitSnapshot_tenantId_idx" ON "EmployeeExitSnapshot"("tenantId");
