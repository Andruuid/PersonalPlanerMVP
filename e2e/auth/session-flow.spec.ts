import { expect, test } from "@playwright/test";
import {
  loginAsSeedAdmin,
  loginAsSeedEmployee,
} from "../fixtures/session";
import {
  testAdminCredentials,
  testEmployeeCredentials,
} from "../fixtures/credentials";

/**
 * Session-Verhalten entspricht typischen Erwartungen an geschützten SPAs/Web-Apps:
 * Abmelden beendet Cookies/Session-Schutz; Wurzel-URL `/` verteilt nach Rolle;
 * bereits angemeldete Nutzer:innen erreichen keine doppelte Login-Maske absichtlich.
 */

test.describe("Session & Routing nach Auth-Zustand", () => {
  async function expectSessionUnauthenticated(page: import("@playwright/test").Page) {
    await expect
      .poll(
        async () => {
          const payload = (await page.evaluate(async () => {
            const response = await fetch("/api/auth/session", {
              credentials: "include",
              cache: "no-store",
              headers: { "cache-control": "no-cache" },
            });
            if (!response.ok) return { __error: response.status };
            return (await response.json()) as { user?: unknown } | null;
          })) as { user?: unknown; __error?: number } | null;

          expect(payload?.__error).toBeUndefined();
          return payload?.user ?? null;
        },
        {
          timeout: 5_000,
          message: "Session should be cleared after logout",
        },
      )
      .toBeFalsy();
  }

  async function expectNoSessionCookie(page: import("@playwright/test").Page) {
    // Browser-level check: catches the Netlify regression class where the
    // session cookie still carries a valid JWT after logout even though
    // /api/auth/session reports unauthenticated at that moment.
    //
    // Note: Chromium retains an empty-value entry in its cookie jar after a
    // Max-Age=0 clear instead of removing the row entirely; treat empty value
    // as absent because an empty cookie carries no JWT payload.
    const cookies = await page.context().cookies();
    const liveSessionCookie = cookies.find(
      (c) =>
        /^(__Secure-)?(next-auth|authjs)\.session-token(?:\.\d+)?$/.test(c.name) &&
        c.value !== "",
    );
    expect(
      liveSessionCookie,
      `session cookie must carry no JWT after logout (found: ${liveSessionCookie?.name ?? "none"})`,
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
        const logoutResponse = page.waitForResponse(
          (response) =>
            response.url().includes("/api/logout") &&
            response.request().method() === "POST",
        );
        await signOutItem.click();
        const response = await logoutResponse;
        expect(response.status()).toBe(303);
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

  test("Nach Logout zeigt eine geschützte Route niemals die zuvor angemeldete Person (User-A → Logout → User-B Regression)", async ({
    page,
  }) => {
    /**
     * Catches the Netlify-only bug class where logging out user A still
     * surfaces a different user's identity on the next protected-page hit
     * — e.g. a CDN-cached HTML response baked with another user's email,
     * or a stale session-token cookie that survived the clearing.
     *
     * Sequence:
     *   1. Log in as employee (anna.keller). Verify her email shown.
     *   2. Log out. Cookie + session must be gone.
     *   3. Log in as admin. The admin's email must show on /dashboard —
     *      crucially NOT the employee email from step 1.
     *   4. Log out. Cookie + session must be gone.
     *   5. Direct navigation to /dashboard must redirect to /login (no
     *      cached HTML with either user shown).
     */
    await loginAsSeedEmployee(page);
    await expect(page).toHaveURL(/\/my-week/);
    await expect(
      page.getByRole("button", { name: "Benutzermenü" }),
    ).toContainText(testEmployeeCredentials.email);

    await openUserMenuAndSignOut(page);
    await expect(page).toHaveURL(/\/login/);
    await expectSessionUnauthenticated(page);
    await expectNoSessionCookie(page);

    await loginAsSeedAdmin(page);
    await expect(page).toHaveURL(/\/dashboard/);
    const trigger = page.getByRole("button", { name: "Benutzermenü" });
    await expect(trigger).toContainText(testAdminCredentials.email);
    await expect(trigger).not.toContainText(testEmployeeCredentials.email);

    await openUserMenuAndSignOut(page);
    await expect(page).toHaveURL(/\/login/);
    await expectSessionUnauthenticated(page);
    await expectNoSessionCookie(page);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    // The cached-HTML failure mode would render a Benutzermenü trigger on
    // /dashboard; the redirect to /login must happen before any such UI
    // becomes visible.
    await expect(
      page.getByRole("button", { name: "Benutzermenü" }),
    ).toHaveCount(0);
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
