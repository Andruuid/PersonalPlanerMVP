import { expect, test } from "@playwright/test";

/**
 * Unauthentische Zugriffe: proxy.ts leitet geschützte Pfade zur Anmeldung um
 * und setzt callbackUrl zur Rückkehr nach Login (Spec: Verhalten ohne Session).
 */

test.describe("Zugriffsschutz ohne Session", () => {
  test("geschützten Admin-Pfad ohne Login: Redirect zu /login mit callbackUrl", async ({
    page,
  }) => {
    await test.step("/dashboard direkt ohne Cookie aufrufen", async () => {
      await page.goto("/dashboard");
    });

    await test.step("Landing auf Login-Seite mit Rückweg-Parameter", async () => {
      await expect(page).toHaveURL(/\/login/);
      const url = new URL(page.url());
      expect(url.searchParams.get("callbackUrl")).toBeDefined();
      expect(decodeURIComponent(url.searchParams.get("callbackUrl")!)).toMatch(
        /\/dashboard/,
      );
    });
  });

  test("geschützten Mitarbeitenden-Pfad ohne Login: Redirect zur Anmeldung", async ({
    page,
  }) => {
    await page.goto("/my-week");
    await expect(page).toHaveURL(/\/login/);
  });
});
