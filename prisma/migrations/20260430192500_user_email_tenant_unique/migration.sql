-- Allow the same email across tenants while keeping tenant-local uniqueness.
DROP INDEX IF EXISTS "User_email_key";
DROP INDEX IF EXISTS "User_tenantId_email_key";
CREATE UNIQUE INDEX "User_email_tenantId_key" ON "User"("email", "tenantId");
