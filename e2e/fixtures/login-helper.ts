import { expect, type Page } from "@playwright/test";
/** Login-Shape für die Anmelden-Form */
export interface LoginCredentials {
  email: string;
  password: string;
}

function pathnameLeftLogin(url: URL): boolean {
  const p = url.pathname;
  return p !== "/login" && !p.startsWith("/login/");
}

/**
 * Füllt /login aus und sendet ab.
 *
 * Avoid `networkidle`: WebKit (Desktop + mobile project) often resolves it before
 * the server-action redirect + Set-Cookie fully apply on CI, so callers hit
 * geschützte Routen ohne Session. We wait until the URL leaves `/login`, then
 * confirm `/api/auth/session` sees the user (same cookie jar as `page`).
 */
export async function loginOnPage(
  page: Page,
  creds: LoginCredentials,
): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("E-Mail")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("E-Mail").fill(creds.email);
  await page.getByLabel("Passwort").fill(creds.password);

  await Promise.all([
    page.waitForURL((url) => pathnameLeftLogin(url), { timeout: 60_000 }),
    page.getByRole("button", { name: "Anmelden" }).click(),
  ]);

  const expectedEmail = creds.email.toLowerCase();
  await expect
    .poll(
      async () => {
        const res = await page.request.get("/api/auth/session");
        if (!res.ok) return null;
        const data = (await res.json()) as { user?: { email?: string | null } };
        const email = data?.user?.email;
        return typeof email === "string" ? email.toLowerCase() : null;
      },
      {
        timeout: 15_000,
        message: "Session cookie not established after login (check credentials / DB seed)",
      },
    )
    .toBe(expectedEmail);

  await page.waitForLoadState("load");
}
