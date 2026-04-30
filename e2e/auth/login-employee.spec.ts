import { expect, test } from "@playwright/test";
import { loginAsSeedEmployee } from "../fixtures/session";

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
      await loginAsSeedEmployee(page);
    });

    await test.step("Mitarbeitenden-Ansicht ist sichtbar", async () => {
      await expect(page).toHaveURL(/\/my-week/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Meine Woche" }),
      ).toBeVisible();
    });
  });
});
