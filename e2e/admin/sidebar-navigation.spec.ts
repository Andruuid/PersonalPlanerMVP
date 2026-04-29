import { expect, test } from "@playwright/test";
import { loginAsSeedAdmin } from "../fixtures/session";

/**
 * Bezug Produktkern: Hauptmenü („Planung“) spiegelt Kernarbeitsflächen — Wochenraster,
 * Stammdaten, Antragseingang, Zeit/Buchführungskontext, Kompliance (SFK/Kompensation,
 * Nachvollziehbarkeit). Keine Logik-Assertions zu berechneten Werten.
 *
 * Vorbedingung: Desktop-Breite, damit die permanente Sidebar sichtbar ist (`md:block`).
 * Daten: prisma/seed, Tenant-Slug „default“.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test.describe("Admin: Sidebar erreicht Hauptmodule (Smoke)", () => {
  test("Menüpunkt „Wochenplanung“: Kalender-/Raster-Arbeitsfläche (KW, Standort-Spur)", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: zentrale Wochenplanung mit Kalender-KW und Planungsraster wird
     * ohne Fehler angezeigt (Funktionalität Kernmodul nach Spezifikation).
     */
    await loginAsSeedAdmin(page);
    await page.getByRole("navigation").getByRole("link", { name: "Wochenplanung" }).click();
    await expect(page).toHaveURL(/\/planning/);
    await expect(page.getByRole("heading", { level: 1, name: "Wochenplanung" })).toBeVisible();
    await expect(page.getByText(/^KW\b/).first()).toBeVisible();
  });

  test("Menüpunkt „Mitarbeitende“: Stammdatenliste inklusive Seed-Kontext Anna Keller", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: Stammdaten der Beschäftigten laden; konkrete Testperson aus dem Seed
     * („Anna Keller“ — demo-fähige Konstellation) wird sichtbar, um einen reproduzierbaren
     * Datenstand zu verankern statt Zahlen ohne Kontext zu behaupten.
     */
    await loginAsSeedAdmin(page);
    await page.getByRole("navigation").getByRole("link", { name: "Mitarbeitende" }).click();
    await expect(page).toHaveURL(/\/employees/);
    await expect(page.getByRole("heading", { level: 1, name: "Mitarbeitende" })).toBeVisible();
    const table = page.getByRole("table").first();
    await expect(table).toContainText("Anna");
    await expect(table).toContainText("Keller");
  });

  test("Menüpunkt „Dienste“: Dienstvorlagen (Grundlage für Raster-Blöcke in der Planung)", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: Stammdaten Dienstvorlagen (Früh/Spät o.Ä.) sind für die spätere
     * Zuordnung im Raster erreichbar — Kontextbezug Spezifikation „Dienst-Definition vor Planung”.
     */
    await loginAsSeedAdmin(page);
    await page.getByRole("navigation").getByRole("link", { name: "Dienste" }).click();
    await expect(page).toHaveURL(/\/services/);
    await expect(page.getByRole("heading", { level: 1, name: "Dienste" })).toBeVisible();
  });

  test("Menüpunkt „Abwesenheiten“: Eingangs-/Workflow-Ansicht für Wünsche & Anträge", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: Arbeitspaket Abwesenheiten (einheitlicher Eingang für die
     * Geschäftsleitung) ist erreichbar — ohne feste Zahl gelieferter Anträge aus dem Seed.
     */
    await loginAsSeedAdmin(page);
    await page.getByRole("navigation").getByRole("link", { name: "Abwesenheiten" }).click();
    await expect(page).toHaveURL(/\/absences/);
    await expect(page.getByRole("heading", { level: 1, name: "Abwesenheiten" })).toBeVisible();
  });

  test("Menüpunkt „Zeitkonten“: Überblick Saldi/Buchführungskontext (Jahreswahl)", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: Übergeordnete Zeit-/Kontoübersicht (Salden pro Person) entsprechend
     * Kontenmodell; Header und Jahres-Spur ohne tiefe Bewegungsbuchungs-Checks.
     */
    await loginAsSeedAdmin(page);
    await page.getByRole("navigation").getByRole("link", { name: "Zeitkonten" }).click();
    await expect(page).toHaveURL(/\/accounts/);
    await expect(page.getByRole("heading", { level: 1, name: "Zeitkonten" })).toBeVisible();
    await expect(page.getByText(/^Konten ·/)).toBeVisible();
  });

  test("Menüpunkt „Einstellungen“: Betriebsspezifisch Standorte/Feiertagskalender‑Spur", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: konfiguratorische Einstellungen (Standorte & Feiertage als Input für
     * Sollzeit/Planung nach Spezifikation) sind ladbar.
     */
    await loginAsSeedAdmin(page);
    await page.getByRole("navigation").getByRole("link", { name: "Einstellungen" }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole("heading", { level: 1, name: "Einstellungen" })).toBeVisible();
  });

  test("„Sonn-/Feiertagskomp.“: geschäftsrelevantes Kompensationsthema nach Feiertags-/SFK-Logik", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: Modul zur Sonn-/Feiertagskompensation aus dem Funktionskatalog erreicht —
     * Fristenbezogene Arbeitspakete, Detaildatenbewertungen bleiben außerhalb dieses Smoke-Tests.
     */
    await loginAsSeedAdmin(page);
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Sonn-/Feiertagskomp." })
      .click();
    await expect(page).toHaveURL(/\/compensation-cases/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sonn-/Feiertagskompensation" }),
    ).toBeVisible();
  });

  test("Menüpunkt „Datenschutz“: Verwaltung DSGVO/DSG-Anfragen (Compliance)", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: Admin-Kontext für Bearbeitung von Auskunfts-/Löschanträgen
     * (Datenschutz-Stelle laut Nav-Label „Datenschutz“) — Seite mit erwarteter Überschrift.
     */
    await loginAsSeedAdmin(page);
    await page.getByRole("navigation").getByRole("link", { name: "Datenschutz" }).click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(
      page.getByRole("heading", { level: 1, name: "DSGVO/DSG-Anfragen" }),
    ).toBeVisible();
  });

  test("Menüpunkt „Audit-Log“: revisionsfähige Historie Änderungen (Filter vorhanden)", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: revisionssicherer Nachweis („wer hat was geändert“) entspricht
     * Spez-Anforderung Auditierbarkeit; Filterleiste wird grob gesichtbar (keine Eintragszahl).
     */
    await loginAsSeedAdmin(page);
    await page.getByRole("navigation").getByRole("link", { name: "Audit-Log" }).click();
    await expect(page).toHaveURL(/\/audit/);
    await expect(page.getByRole("heading", { level: 1, name: "Audit-Log" })).toBeVisible();
    // Filter-Spalten gemäß UX (Text sichtbar — kein feingranularer Label-Verknüpfungstest)
    await expect(page.getByText("Benutzer:in", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Entität", { exact: true }).first()).toBeVisible();
  });
});
