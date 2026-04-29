import { expect, type Page } from "@playwright/test";
/** Login-Shape für die Anmelden-Form */
export interface LoginCredentials {
  tenantSlug: string;
  email: string;
  password: string;
}

/** Füllt /login aus und sendet ab. Bei parallelen E2Es kann `next dev` kurz backlog — Formular wartet explizit. */
export async function loginOnPage(
  page: Page,
  creds: LoginCredentials,
): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const tenantSlug = page.getByLabel("Betrieb (Slug)");
  await expect(tenantSlug).toBeVisible({ timeout: 60_000 });
  await tenantSlug.fill(creds.tenantSlug);
  await page.getByLabel("E-Mail").fill(creds.email);
  await page.getByLabel("Passwort").fill(creds.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
}
