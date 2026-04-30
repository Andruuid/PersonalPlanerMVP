import { expect, test } from "@playwright/test";
import { loginAsSeedEmployee } from "../fixtures/session";

/**
 * Smoke nach Mitarbeitenden-Login: Seite „Meine Woche“ mit Wochentitel und Kernbereichen.
 */

test.describe("Meine Woche (Smoke)", () => {
  test("zeigt Meine-Woche-Überschrift und Kernbereiche", async ({ page }) => {
    await test.step("Als Mitarbeitende:r anmelden", async () => {
      await loginAsSeedEmployee(page);
    });

    await test.step("Haupttitel und KW-Zeile sichtbar", async () => {
      await expect(
        page.getByRole("heading", { level: 1, name: "Meine Woche" }),
      ).toBeVisible();
      await expect(page.getByText(/^KW\b/)).toBeVisible();
    });

    await test.step("Abschnitte Meine Einsätze vorhanden", async () => {
      await expect(
        page.getByRole("heading", { name: "Meine Einsätze", exact: false }),
      ).toBeVisible();
    });
  });
});
