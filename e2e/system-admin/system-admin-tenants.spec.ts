import { expect, test } from "@playwright/test";
import { loginAsSystemAdmin } from "../fixtures/session";
import { loginOnPage } from "../fixtures/login-helper";

test.describe("System-Admin: Mandantenverwaltung", () => {
  test("Login ohne Tenant-Picker + Mandant anlegen + Audit geschrieben", async ({
    page,
    browser,
  }) => {
    const suffix = Date.now().toString();
    const tenantName = `Demo Betrieb 2 ${suffix}`;
    const tenantSlug = `demo-betrieb-2-${suffix}`;
    const adminEmail = `admin+${suffix}@demo-betrieb-2.test`;

    await loginAsSystemAdmin(page);
    await expect(page).not.toHaveURL(/\/select-tenant/);
    await expect(page).toHaveURL(/\/system-admin\/tenants/);

    await page.getByRole("link", { name: "Neuer Mandant" }).click();
    await expect(page).toHaveURL(/\/system-admin\/tenants\/new/);

    await page.getByLabel("Name").fill(tenantName);
    await page.getByLabel("Slug").fill(tenantSlug);
    await page.getByLabel("Default-Sollzeit (Min./Woche)").fill("2520");
    await page.getByLabel("Default-HAZ (Min./Woche)").fill("2700");
    await page.getByLabel("Initiale Kunden-Admin E-Mail").fill(adminEmail);
    await page.getByRole("button", { name: "Mandant erstellen" }).click();

    const tempPasswordBox = page.getByText("Temporäres Passwort:");
    await expect(tempPasswordBox).toBeVisible();
    const tempPasswordText = (await tempPasswordBox.textContent()) ?? "";
    const tempPassword = tempPasswordText.replace("Temporäres Passwort:", "").trim();
    expect(tempPassword).toMatch(/^Tmp-/);

    await page.goto("/system-admin/tenants");
    await expect(page.getByText(tenantName)).toBeVisible();

    // Verify audit visibility from the newly created tenant-admin perspective.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginOnPage(adminPage, { email: adminEmail, password: tempPassword });
    await adminPage.goto("/audit");
    await expect(adminPage).toHaveURL(/\/audit/);
    await expect(adminPage.getByRole("cell", { name: "TENANT_CREATED" })).toBeVisible();
    await adminContext.close();
  });

  test("Mandant deaktivieren/reaktivieren schreibt Audit", async ({
    page,
    browser,
  }) => {
    const suffix = Date.now().toString();
    const tenantName = `Demo Betrieb 2 Toggle ${suffix}`;
    const tenantSlug = `demo-betrieb-2-toggle-${suffix}`;
    const adminEmail = `admin+toggle-${suffix}@demo-betrieb-2.test`;

    await loginAsSystemAdmin(page);
    await page.getByRole("link", { name: "Neuer Mandant" }).click();

    await page.getByLabel("Name").fill(tenantName);
    await page.getByLabel("Slug").fill(tenantSlug);
    await page.getByLabel("Default-Sollzeit (Min./Woche)").fill("2520");
    await page.getByLabel("Default-HAZ (Min./Woche)").fill("2700");
    await page.getByLabel("Initiale Kunden-Admin E-Mail").fill(adminEmail);
    await page.getByRole("button", { name: "Mandant erstellen" }).click();

    const tempPasswordText =
      (await page.getByText("Temporäres Passwort:").textContent()) ?? "";
    const tempPassword = tempPasswordText.replace("Temporäres Passwort:", "").trim();
    expect(tempPassword).toMatch(/^Tmp-/);

    await page.goto("/system-admin/tenants");
    const row = page.locator("tr", { hasText: tenantName });
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: "Details" }).click();
    await expect(page).toHaveURL(/\/system-admin\/tenants\/.+/);

    await page.getByRole("button", { name: "Deaktivieren" }).click();
    await expect(page.getByText("Mandant wurde deaktiviert.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Reaktivieren" })).toBeVisible();

    await page.getByRole("button", { name: "Reaktivieren" }).click();
    await expect(page.getByText("Mandant wurde reaktiviert.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Deaktivieren" })).toBeVisible();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginOnPage(adminPage, { email: adminEmail, password: tempPassword });
    await adminPage.goto("/audit");
    await expect(adminPage.getByRole("cell", { name: "TENANT_DEACTIVATED" })).toBeVisible();
    await expect(adminPage.getByRole("cell", { name: "TENANT_REACTIVATED" })).toBeVisible();
    await adminContext.close();
  });
});
