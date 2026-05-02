import { expect, test } from "@playwright/test";
import { loginAsSeedAdmin } from "../fixtures/session";

/**
 * Admin «Mitarbeiter-Ansicht»: Picker und Vorschau mit ?employee=.
 *
 * Vorbedingung: Seed mit Mitarbeitenden (z. B. Anna Keller).
 */
test.describe("Admin employee preview", () => {
  test("nach Umschalten Mitarbeiter auswählen und Wochenansicht sehen", async ({
    page,
  }) => {
    await loginAsSeedAdmin(page);

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
    // «Vorschau»-Badge sitzt in der Topbar nur ab `md` (`hidden md:flex`); auf Mobile
    // genügen URL mit ?employee= + Wochenüberschrift.

    // Sidebar-„Anträge“ steckt im Burger-Menü (Sheet); der Kurzlink im Seiteninhalt ist überall klickbar.
    await page.getByRole("link", { name: /Alle Anträge ansehen/ }).click();
    await expect(page).toHaveURL(/\/my-requests\?employee=/);
    await expect(
      page.getByRole("heading", { name: /Anträge von Anna Keller/i }),
    ).toBeVisible();
  });
});
