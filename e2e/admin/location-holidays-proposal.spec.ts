import { expect, test } from "@playwright/test";
import { loginAsSeedAdmin } from "../fixtures/session";

test.describe("Admin Feiertage: CH-Vorschlag + lokales Override", () => {
  test("Zuerich 2026 evangelisch vorschlagen, Sechselaeuten hinzufuegen, speichern", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await loginAsSeedAdmin(page);

    await page.goto("/settings");
    const zuerichRow = page
      .locator("li")
      .filter({ hasText: "Standort Zürich" })
      .first();
    await expect(zuerichRow).toBeVisible();
    await zuerichRow.getByRole("link", { name: "Feiertage" }).click();

    await expect(page).toHaveURL(/\/locations\/loc-zuerich\/holidays/);
    await expect(page.getByRole("heading", { name: /Feiertage - Standort Zürich/ })).toBeVisible();

    await page.getByLabel("Jahr").selectOption("2026");
    await page.getByLabel("Evangelisch").check();

    await expect(page.getByRole("cell", { name: "Bundesfeier" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Fronleichnam" })).toHaveCount(0);

    await page.getByLabel("Lokaler Feiertag - Datum").fill("2026-04-20");
    await page.getByLabel("Lokaler Feiertag - Name").fill("Sechseläuten");
    await page.getByRole("button", { name: "Hinzufügen" }).click();

    await expect(page.getByRole("cell", { name: "Sechseläuten" })).toBeVisible();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText(/Feiertage gespeichert:/)).toBeVisible();

    await page.goto("/settings?locationId=loc-zuerich&year=2026");
    await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
    await expect(page.getByRole("table").first()).toContainText("Sechseläuten");
  });

  test("Konfession wechseln aendert nur Vorschlaege, persistierte Feiertage erst nach Speichern", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await loginAsSeedAdmin(page);

    await page.goto("/locations/loc-zuerich/holidays");
    await expect(page).toHaveURL(/\/locations\/loc-zuerich\/holidays/);

    await page.getByLabel("Jahr").selectOption("2026");
    await page.getByLabel("Evangelisch").check();
    await expect(page.getByRole("cell", { name: "Fronleichnam" })).toHaveCount(0);

    await page.getByLabel("Katholisch").check();
    await expect(page.getByRole("cell", { name: "Fronleichnam" })).toBeVisible();

    // Kein Speichern: persistierter Kalender bleibt unverändert.
    await page.goto("/settings?locationId=loc-zuerich&year=2026");
    const settingsTable = page.getByRole("table").first();
    await expect(settingsTable).not.toContainText("Fronleichnam");
  });
});
