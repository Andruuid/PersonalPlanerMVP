-- Drop global uniqueness on User.email; @@unique([tenantId, email]) remains (User_tenantId_email_key).
DROP INDEX IF EXISTS "User_email_key";
