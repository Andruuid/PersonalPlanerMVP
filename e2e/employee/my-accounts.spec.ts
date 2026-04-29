import { expect, test } from "@playwright/test";
import { loginAsSeedEmployee } from "../fixtures/session";

/**
 * Bezug Produktkern: Zeitsaldi, Ferien, TZT/UEZ und nachvollziehbare Buchungs-Historie
 * (Mitarbeitenden-Sicht) — wie in Spezifikation/README zur Zeitlogik beschrieben.
 *
 * Vorbedingung: Anna Keller mit verknüpftem `employeeId` im Seed; keine Annahme zu
 * konkreten Salden (nur Struktur der Seite).
 */

test.describe("Mitarbeitende: Zeitkonten-Sicht", () => {
  test("„Meine Konten“: Salden-Panel und Buchungs-Historie pro Jahr", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: die Arbeitsfläche „Meine Konten“ lädt mit Jahres-Kontext,
     * sichtbarem Panel-Bereich und der Sektion Buchungs-Historie (ohne numerische
     * Invarianten aus der DB).
     */
    await loginAsSeedEmployee(page);
    await page.goto("/my-accounts");
    await expect(page).toHaveURL(/\/my-accounts/);
    await expect(page.getByRole("heading", { level: 1, name: "Meine Konten" })).toBeVisible();
    await expect(page.getByText(/^Konten ·/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Buchungs-Historie" })).toBeVisible();
  });
});
