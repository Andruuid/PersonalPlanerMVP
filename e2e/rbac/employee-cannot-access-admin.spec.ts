import { expect, test } from "@playwright/test";
import { loginAsSeedEmployee } from "../fixtures/session";

/**
 * Bezug Spezifikation / Zielsystem: Geschäftsleitung („Admin”) bearbeitet Stammdaten
 * und Planung; Mitarbeitende sehen keine Admin-Pages.
 *
 * Vorbedingungen: gültiges Mitarbeitenden-Login Anna Keller (Tenant „default“,
 * Daten aus prisma/seed). proxy.ts schützt Admin-Pfade durch Umleitung auf `/my-week`.
 */

test.describe("RBAC: Mitarbeitende keine Admin-Bereiche", () => {
  test("Wochenplanung: für Mitarbeitende nicht erreichbar → Redirect zu `/my-week`", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: Zugriff auf `/planning` (Wochenraster/KW-Arbeitspaket für die
     * Geschäftsleitung) ist für EMPLOYEE-Rolle gesperrt; keine Fehlerseite, sondern
     * gültiges Rollenrouting.
     */
    await loginAsSeedEmployee(page);
    await expect(page).toHaveURL(/\/my-week/);
    await page.goto("/planning");
    await expect(page).toHaveURL(/\/my-week/);
    await expect(page).not.toHaveURL(/\/planning/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Meine Woche" }),
    ).toBeVisible();
  });

  test("Stammdaten Mitarbeitende: `/employees` nur für Admin", async ({ page }) => {
    /**
     * Was wird geprüft: Liste der Beschäftigten/Stammdaten ist ein Admin-Prozess;
     * Mitarbeitende werden nicht zur Tabelle geleitet.
     */
    await loginAsSeedEmployee(page);
    await page.goto("/employees");
    await expect(page).toHaveURL(/\/my-week/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Meine Woche" }),
    ).toBeVisible();
  });

  test("Admin-Zeitkonten `/accounts` (Saldentabelle): für Mitarbeitende gesperrt", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: die Admin-Gesamtübersicht der Zeitkonten (`/accounts`) ist kein
     * Mitarbeitenden-Modul — Umleitung auf die persönliche Startansicht.
     */
    await loginAsSeedEmployee(page);
    await page.goto("/accounts");
    await expect(page).toHaveURL(/\/my-week/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Meine Woche" }),
    ).toBeVisible();
  });

  test("Audit-Log: `/audit` nur für Geschäftsleitung nachvollziehbar", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: Änderungsprotokoll (Nachvollziehbarkeit) ist keine
     * Mitarbeitenden-Selbsteinsicht.
     */
    await loginAsSeedEmployee(page);
    await page.goto("/audit");
    await expect(page).toHaveURL(/\/my-week/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Meine Woche" }),
    ).toBeVisible();
  });
});
