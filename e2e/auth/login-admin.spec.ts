import { expect, test } from "@playwright/test";
import { loginOnPage } from "../fixtures/login-helper";
import { testAdminCredentials } from "../fixtures/credentials";

/**
 * Admin-Anmeldung mit Demo-Konten aus README/Seed (`admin@demo.ch`).
 *
 * Erwartung: Nach erfolgreicher Anmeldung Weiterleitung zur Admin-Zielseite
 * (/dashboard oder / nach Rollenrouting).
 */

test.describe("Admin: Login und Weiterleitung", () => {
  test("leitet zum Dashboard weiter", async ({ page }) => {
    await test.step("Login-Form ausfüllen und absenden", async () => {
      await loginOnPage(page, testAdminCredentials);
    });

    await test.step("Warten auf erfolgreichen Auth-Redirect zur Admin-Oberfläche", async () => {
      await page.waitForURL((url) => /\/dashboard$/.test(url.pathname), {
        timeout: 15_000,
      });
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Dashboard" }),
      ).toBeVisible();
    });
  });
});
