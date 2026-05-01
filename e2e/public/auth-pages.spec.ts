import { expect, test } from "@playwright/test";

/**
 * Bezug Produktkern: Mandanten-Anmeldung und optionale Neueinschreibung eines Betriebs
 * (öffentliche Einstiege ohne Session). Datenbankabdeckung ohne Login impliziert keine
 * Seed-Veränderungen.
 */

test.describe("Öffentliche Einstiegseiten (ohne Login)", () => {
  test("Login: Formular Anmeldung (E-Mail + Passwort nach global eindeutiger User-E-Mail)", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: öffentlicher Einstieg „Anmelden“ ohne Betriebs-Slug –
     * Tenant ergibt sich aus der User-Zeile.
     */
    await page.goto("/login");
    await expect(
      page.locator('[data-slot="card-title"]').filter({ hasText: /^Anmelden$/ }),
    ).toBeVisible();
    await expect(page.getByLabel("E-Mail")).toBeVisible();
    await expect(page.getByLabel("Passwort")).toBeVisible();
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
  });

  test("/signup ist nicht öffentlich und leitet auf /login um", async ({
    page,
  }) => {
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(
      page.locator('[data-slot="card-title"]').filter({ hasText: /^Anmelden$/ }),
    ).toBeVisible();
  });
});
