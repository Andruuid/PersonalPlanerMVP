import { expect, test } from "@playwright/test";
import { loginAsSeedAdmin } from "../fixtures/session";

test.describe("RBAC: Kunden-Admin kein Zugriff auf System-Admin", () => {
  test("kann /system-admin/tenants nicht öffnen", async ({ page }) => {
    await loginAsSeedAdmin(page);
    await page.goto("/system-admin/tenants");
    await expect(page).toHaveURL(/\/forbidden/);
  });
});
