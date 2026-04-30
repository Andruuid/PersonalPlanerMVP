import { expect, test } from "@playwright/test";
import {
  loginAsSeedAdmin,
  loginAsSeedEmployee,
} from "../fixtures/session";

/**
 * Session-Verhalten entspricht typischen Erwartungen an geschützten SPAs/Web-Apps:
 * Abmelden beendet Cookies/Session-Schutz; Wurzel-URL `/` verteilt nach Rolle;
 * bereits angemeldete Nutzer:innen erreichen keine doppelte Login-Maske absichtlich.
 */

test.describe("Session & Routing nach Auth-Zustand", () => {
  async function expectSessionUnauthenticated(page: import("@playwright/test").Page) {
    const response = await page.request.get("/api/auth/session");
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as { user?: unknown } | null;
    expect(payload?.user).toBeFalsy();
  }

  async function expectNoSessionCookie(page: import("@playwright/test").Page) {
    // Browser-level check: catches the Netlify regression class where the
    // session cookie survives logout even though /api/auth/session returns
    // an unauthenticated payload at that moment.
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) =>
      /^(__Secure-)?(next-auth|authjs)\.session-token$/.test(c.name),
    );
    expect(
      sessionCookie,
      `session cookie must be cleared after logout (found: ${sessionCookie?.name ?? "none"})`,
    ).toBeUndefined();
  }

  async function openUserMenuAndSignOut(page: import("@playwright/test").Page) {
    const menuTrigger = page.getByRole("button", { name: "Benutzermenü" });
    const signOutItem = page.getByRole("menuitem", { name: /^Abmelden/ });

    // Radix menu can be briefly detached in CI/headless runs; retry a few times.
    for (let attempt = 0; attempt < 3; attempt++) {
      await menuTrigger.click();
      await signOutItem.waitFor({ state: "visible", timeout: 3_000 });
      if (await signOutItem.isVisible()) {
        await signOutItem.click();
        return;
      }
      await page.waitForTimeout(200);
    }

    throw new Error("Logout menu item not reachable");
  }

  test("Logout über Benutzermenü beendet Session und schützt Employee-Routen", async ({
    page,
  }) => {
    await loginAsSeedEmployee(page);
    await expect(page).toHaveURL(/\/my-week/);

    await openUserMenuAndSignOut(page);
    await expect(page).toHaveURL(/\/login/);
    await expectSessionUnauthenticated(page);
    await expectNoSessionCookie(page);

    await page.goto("/my-week");
    await expect(page).toHaveURL(/\/login/);

    // Re-check after protected-route attempt; catches regressions where a stale
    // cookie accidentally rehydrates a session on some hosts/runtimes.
    await expectSessionUnauthenticated(page);
    await expectNoSessionCookie(page);
  });

  test("Ohne gültige Session: `/dashboard` führt zurück zur Anmeldung", async ({
    page,
    context,
  }) => {
    /**
     * Was wird geprüft: **Schutz geschützter Admin-Routes nach Ende der Session.**
     * Wir simulieren das Entfernen der Auth-Cookies (gleiche Wirksamkeit wie „Abmelden“
     * in der UI oder abgelaufenem Token) — ohne brüchigen Klick durch Radix‑Dropdown-
     * Portal in automatisierten Headless‑Läufen (Snapshot zeigt Fokus, Menü‑Pane selten stabil).
     * Nach diesem Zustand muss `/dashboard` erneut auf `/login` verweisen.
     */
    await loginAsSeedAdmin(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await context.clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Bereits als Admin eingeloggt: `/login` leitet zurück ins Dashboard", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: Bei aktiver Session die öffentliche Login-Route nicht
     * weiter nutzbar soll — Auth-Zustand entscheidet (proxy/next-auth Verhalten).
     */
    await loginAsSeedAdmin(page);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeVisible();
  });

  test("Mitarbeitende:r: Aufruf der Wurzel `/` wird auf „Meine Woche“ geleitet", async ({
    page,
  }) => {
    /**
     * Was wird geprüft: Rollen-heuristische Startseite für EMPLOYEE (`proxy.ts` für `/`)
     * führt zur Einsicht der aktuellen Arbeitswoche, nicht zum Admin-Dashboard.
     */
    await loginAsSeedEmployee(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/my-week/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Meine Woche" }),
    ).toBeVisible();
  });
});
