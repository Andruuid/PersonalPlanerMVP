-- Resolve legacy duplicate emails before global uniqueness (same admin email on default + demo tenant).
UPDATE "User"
SET email = 'demo-sandbox-admin@demo.ch'
WHERE email = 'admin@demo.ch'
  AND tenantId IN (SELECT id FROM "Tenant" WHERE slug = 'demo');

-- Drop per-tenant composite; email is the single identity key system-wide.
DROP INDEX IF EXISTS "User_tenantId_email_key";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
