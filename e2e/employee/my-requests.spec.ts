import { expect, test } from "@playwright/test";
import { addDays, format } from "date-fns";
import { testEmployeeCredentials } from "../fixtures/credentials";
import { loginAsSeedAdmin, loginAsSeedEmployee } from "../fixtures/session";

/**
 * Bezug Produktkern: Arbeitnehmenden-Selbsteinsicht über Einsatzwoche hinaus — Anträge
 * (Absenzen, TZV/DSG-Verbrauch) entsprechend Mitarbeitenden-Dashboard-Anforderung.
 */

test.describe("Mitarbeitende: Antragssicht", () => {
  test(`„Meine Anträge": Schnellwahl & Status-Buckets ohne feste Antragszahlen aus DB`, async ({
    page,
  }) => {
    /**
     * Was wird geprüft: Arbeitspakete „Anträge“ mit Schnellwahl zur Einreichung,
     * thematischer Datenschutz-Block sowie Status-Sektionen (offen/zugestimmt/abgelehnt)
     * laden — konkreten Antragsbestand NICHT deterministisch (Seed kann ohne offene Punkte sein).
     */
    await loginAsSeedEmployee(page);
    await page.goto("/my-requests");
    await expect(page).toHaveURL(/\/my-requests/);
    await expect(page.getByRole("heading", { level: 1, name: "Meine Anträge" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Schnell beantragen", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Datenschutz (DSGVO/DSG)", exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Offen" })).toHaveCount(2);
    await expect(page.getByRole("heading", { level: 3, name: "Genehmigt" })).toHaveCount(2);
    await expect(page.getByRole("heading", { level: 3, name: "Abgelehnt" })).toHaveCount(2);
  });

  test("Mitarbeitende zieht offenen Ferienantrag zurück; Audit + Dashboard-Zähler stimmen", async ({
    browser,
  }) => {
    const adminContextBefore = await browser.newContext();
    const adminPageBefore = await adminContextBefore.newPage();

    const requestTag = `e2e-withdraw-${Date.now()}`;
    const vacationDate = format(addDays(new Date(), 14), "yyyy-MM-dd");

    await loginAsSeedAdmin(adminPageBefore);
    const baseOpenCount = await readOpenAbsencesDashboardCount(adminPageBefore);
    await adminContextBefore.close();

    const employeeContext = await browser.newContext();
    const employeePage = await employeeContext.newPage();
    await loginAsSeedEmployee(employeePage);
    await employeePage.goto("/my-requests");
    await expect(employeePage).toHaveURL(/\/my-requests/);
    await expect(
      employeePage.getByRole("heading", { level: 1, name: "Meine Anträge" }),
    ).toBeVisible();

    const vacationButton = employeePage.getByRole("button", {
      name: "Ferien beantragen",
    });
    await expect(vacationButton).toBeVisible();
    const dialog = employeePage.getByRole("dialog");
    for (let attempt = 0; attempt < 3; attempt++) {
      await vacationButton.click();
      try {
        await expect(dialog).toBeVisible({ timeout: 2_500 });
        break;
      } catch {
        if (attempt === 2) throw new Error("Antragsdialog öffnet nicht.");
      }
    }
    await dialog.getByLabel("Von").fill(vacationDate);
    await dialog.getByLabel("Bis").fill(vacationDate);
    await dialog.getByLabel("Kommentar (optional)").fill(requestTag);
    await dialog.getByRole("button", { name: "Antrag senden" }).click();
    await expect(dialog).not.toBeVisible();

    const openSection = employeePage
      .locator("section")
      .filter({ has: employeePage.getByRole("heading", { level: 3, name: "Offen" }) })
      .first();
    const openRow = openSection.locator("li").filter({
      hasText: requestTag,
      has: employeePage.getByText("Ferienantrag"),
    });
    await expect(openRow).toHaveCount(1);

    const adminContextAfter = await browser.newContext();
    const adminPageAfter = await adminContextAfter.newPage();
    await loginAsSeedAdmin(adminPageAfter);
    await expect.poll(
      async () => {
        await adminPageAfter.reload();
        return readOpenAbsencesDashboardCount(adminPageAfter);
      },
      { timeout: 30_000, message: "Dashboard should include new open request" },
    ).toBe(baseOpenCount + 1);

    await openRow.getByRole("button", { name: "Zurückziehen" }).click();

    const withdrawnSection = employeePage
      .locator("section")
      .filter({
        has: employeePage.getByRole("heading", {
          level: 3,
          name: "Zurückgezogen",
        }),
      })
      .first();
    await expect(
      withdrawnSection.locator("li").filter({ hasText: requestTag }),
    ).toHaveCount(1);

    await expect.poll(
      async () => {
        await adminPageAfter.reload();
        return readOpenAbsencesDashboardCount(adminPageAfter);
      },
      {
        timeout: 30_000,
        message: "Dashboard should decrease after withdrawal",
      },
    ).toBe(baseOpenCount);

    await adminPageAfter.goto("/audit");
    await expect(adminPageAfter).toHaveURL(/\/audit/);
    const withdrawAuditRow = adminPageAfter
      .locator("tbody tr")
      .filter({
        has: adminPageAfter.getByText("WITHDRAW"),
      })
      .filter({
        has: adminPageAfter.getByText("AbsenceRequest"),
      })
      .filter({
        has: adminPageAfter.getByText(testEmployeeCredentials.email),
      });
    await expect(withdrawAuditRow.first()).toBeVisible();

    await adminContextAfter.close();
    await employeeContext.close();
  });
});

async function readOpenAbsencesDashboardCount(
  page: import("@playwright/test").Page,
): Promise<number> {
  const card = page.getByRole("link", { name: /Offene Abwesenheiten/i });
  await expect(card).toBeVisible();
  const text = await card.innerText();
  const match = text.match(/\b\d+\b/);
  if (!match) {
    throw new Error(`Kein KPI-Wert in Karte gefunden: ${text}`);
  }
  return Number.parseInt(match[0], 10);
}
