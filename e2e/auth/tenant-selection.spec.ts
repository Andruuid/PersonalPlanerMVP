import { expect, test } from "@playwright/test";
import { loginOnPage } from "../fixtures/login-helper";
import { testMultiTenantAdminCredentials } from "../fixtures/credentials";

test.describe("Mandanten-Auswahl nach Login", () => {
  test("Multi-tenant Account sieht Picker und landet nach Auswahl im Dashboard", async ({
    page,
  }) => {
    await loginOnPage(page, testMultiTenantAdminCredentials);
    await page.goto("/");

    await expect(page).toHaveURL(/\/select-tenant/);
    await expect(page.getByRole("heading", { name: "Mandant auswählen" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Default Tenant/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Demo Tenant/i })).toBeVisible();

    await page.getByRole("button", { name: /Demo Tenant/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Benutzermenü" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Mandant wechseln" }),
    ).toBeVisible();
    await page.getByRole("menuitem", { name: "Mandant wechseln" }).click();
    await expect(page).toHaveURL(/\/select-tenant/);
    await expect(page.getByText("Zuletzt gewählt")).toBeVisible();
  });
});
