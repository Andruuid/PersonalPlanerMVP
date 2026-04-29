import { expect, test } from "@playwright/test";
import { loginOnPage } from "../fixtures/login-helper";
import { testEmployeeCredentials } from "../fixtures/credentials";

/**
 * Mitarbeitenden-Anmeldung (Seed Anna Keller / demo123 auf Tenant „default“).
 *
 * Erwartung: Rolle EMPLOYEE landet auf „Meine Woche“.
 */

test.describe("Mitarbeitende:r: Login und Weiterleitung", () => {
  test("leitet zur Mitarbeitenden-Ansicht (/my-week) weiter", async ({
    page,
  }) => {
    await test.step("Login mit Mitarbeitenden-Daten", async () => {
      await loginOnPage(page, testEmployeeCredentials);
    });

    await test.step("Warten auf geschützte Employee-Route", async () => {
      await page.waitForURL((url) => /\/my-week/.test(url.pathname), {
        timeout: 15_000,
      });
      await expect(page).toHaveURL(/\/my-week/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Meine Woche" }),
      ).toBeVisible();
    });
  });
});
