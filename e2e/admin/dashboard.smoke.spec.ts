import { expect, test } from "@playwright/test";
import { loginOnPage } from "../fixtures/login-helper";
import { testAdminCredentials } from "../fixtures/credentials";

/**
 * Smoke nach Admin-Login: sichtbare Shell und ein KPI-Verweis (ohne Datenlogik zu testen).
 *
 * Vorbedingung: DB mit Seed wie in README („default“ Tenant, admin@demo.ch).
 */

test.describe("Dashboard (Smoke)", () => {
  test("zeigt Überschrift Dashboard und KPI-Navigation", async ({ page }) => {
    await test.step("Als Admin anmelden", async () => {
      await loginOnPage(page, testAdminCredentials);
      await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    });

    await test.step("Haupttitel der Übersichtsseite prüfen", async () => {
      await expect(
        page.getByRole("heading", { level: 1, name: "Dashboard" }),
      ).toBeVisible();
      await expect(
        page.getByText("Übersicht", { exact: false }).first(),
      ).toBeVisible();
    });

    await test.step("KPI-Karte Mit Link zu einer Kernfunktion sichtbar", async () => {
      await expect(
        page.getByRole("link", { name: /Offene Abwesenheiten/i }),
      ).toBeVisible();
    });
  });
});
