import { expect, test } from "@playwright/test";
import { loginAsSeedAdmin } from "../fixtures/session";

/**
 * Admin-Anmeldung mit Demo-Konten aus README/Seed (`admin@demo.ch`).
 *
 * Erwartung: Nach erfolgreicher Anmeldung Weiterleitung zur Admin-Zielseite
 * (/dashboard oder / nach Rollenrouting).
 */

test.describe("Admin: Login und Weiterleitung", () => {
  test("leitet zum Dashboard weiter", async ({ page }) => {
    await test.step("Login-Form ausfüllen und absenden", async () => {
      await loginAsSeedAdmin(page);
    });

    await test.step("Dashboard sichtbar nach Login", async () => {
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Dashboard" }),
      ).toBeVisible();
    });
  });
});
