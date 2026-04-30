import { expect, type Page } from "@playwright/test";
/** Login-Shape für die Anmelden-Form */
export interface LoginCredentials {
  email: string;
  password: string;
}

/** Füllt /login aus und sendet ab. Bei parallelen E2Es kann `next dev` kurz backlog — Formular wartet explizit. */
export async function loginOnPage(
  page: Page,
  creds: LoginCredentials,
): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("E-Mail")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("E-Mail").fill(creds.email);
  await page.getByLabel("Passwort").fill(creds.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  // Auth uses a server action + redirect; wait for it to settle before callers
  // assert routed destinations.
  await page.waitForLoadState("networkidle");
}
