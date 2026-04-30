import { expect, test } from "@playwright/test";
import { loginAsSeedEmployee } from "../fixtures/session";

/**
 * Bezug Produktkern: Arbeitnehmenden-Selbsteinsicht über Einsatzwoche hinaus — Anträge
 * (Absenzen, TZV/DSG-Verbrauch) entsprechend Mitarbeitenden-Dashboard-Anforderung.
 */

test.describe("Mitarbeitende: Antragssicht", () => {
  test(`„Meine Anträge": Schnellwahl & Status-Buckets ohne feste Antragszahlen aus DB`, async ({
    page,
  }) => {
    /**
     * Was wird geprüft: Arbeitspakete „Anträge“ mit Schnellwahl zur Einreichung,
     * thematischer Datenschutz-Block sowie Status-Sektionen (offen/zugestimmt/abgelehnt)
     * laden — konkreten Antragsbestand NICHT deterministisch (Seed kann ohne offene Punkte sein).
     */
    await loginAsSeedEmployee(page);
    await page.goto("/my-requests");
    await expect(page).toHaveURL(/\/my-requests/);
    await expect(page.getByRole("heading", { level: 1, name: "Meine Anträge" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Schnell beantragen", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Datenschutz (DSGVO/DSG)", exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Offen" })).toHaveCount(2);
    await expect(page.getByRole("heading", { level: 3, name: "Genehmigt" })).toHaveCount(2);
    await expect(page.getByRole("heading", { level: 3, name: "Abgelehnt" })).toHaveCount(2);
  });
});
