import type { Page } from "@playwright/test";

/** Login-Shape für die Anmelden-Form */
export interface LoginCredentials {
  tenantSlug: string;
  email: string;
  password: string;
}

/** Füllt /login aus und sendet ab. Caller wartet bei Bedarf auf Navigation. */
export async function loginOnPage(
  page: Page,
  creds: LoginCredentials,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Betrieb (Slug)").fill(creds.tenantSlug);
  await page.getByLabel("E-Mail").fill(creds.email);
  await page.getByLabel("Passwort").fill(creds.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
}
