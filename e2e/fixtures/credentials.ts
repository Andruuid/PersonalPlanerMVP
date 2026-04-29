/**
 * Demo-Zugänge aus Seed (Tenant-Slug „default“, siehe prisma/seed.ts und README).
 * Nur für lokale/Test-DB gedacht — nicht für Produktion.
 */
export const TEST_TENANT_SLUG_DEFAULT = "default";

export const testAdminCredentials = {
  tenantSlug: TEST_TENANT_SLUG_DEFAULT,
  email: "admin@demo.ch",
  password: "admin123",
};

export const testEmployeeCredentials = {
  tenantSlug: TEST_TENANT_SLUG_DEFAULT,
  email: "anna.keller@demo.ch",
  password: "demo123",
};
