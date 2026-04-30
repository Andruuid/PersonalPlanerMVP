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
