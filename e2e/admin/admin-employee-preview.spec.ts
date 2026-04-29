import { expect, test } from "@playwright/test";
import { loginOnPage } from "../fixtures/login-helper";
import { testAdminCredentials } from "../fixtures/credentials";

/**
 * Admin «Mitarbeiter-Ansicht»: Picker und Vorschau mit ?employee=.
 *
 * Vorbedingung: Seed mit Mitarbeitenden (z. B. Anna Keller).
 */
test.describe("Admin employee preview", () => {
  test("nach Umschalten Mitarbeiter auswählen und Wochenansicht sehen", async ({
    page,
  }) => {
    await loginOnPage(page, testAdminCredentials);
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.getByRole("tab", { name: "Mitarbeiter-Ansicht" }).click();
    await expect(page).toHaveURL(/\/my-week/);
    await expect(
      page.getByRole("heading", { name: /Mitarbeiter:in für die Vorschau wählen/i }),
    ).toBeVisible();

    await page.getByRole("link", { name: /Anna Keller/i }).click();
    await expect(page).toHaveURL(/employee=/);
    await expect(
      page.getByRole("heading", { name: /Woche von Anna Keller/i }),
    ).toBeVisible();
    await expect(page.getByText("Vorschau", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Meine Anträge" }).click();
    await expect(page).toHaveURL(/\/my-requests\?employee=/);
    await expect(
      page.getByRole("heading", { name: /Anträge von Anna Keller/i }),
    ).toBeVisible();
  });
});
