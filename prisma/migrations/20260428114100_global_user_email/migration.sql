-- Enforce global email identity for tenant resolution at login.
-- This intentionally fails if duplicate emails already exist across tenants.
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
