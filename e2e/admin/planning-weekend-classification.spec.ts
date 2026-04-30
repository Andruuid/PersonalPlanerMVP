import { expect, test, type Page } from "@playwright/test";
import { loginAsSeedAdmin } from "../fixtures/session";

async function openWeekendCellDialog(page: Page): Promise<void> {
  const weekendTabs = [
    page.getByRole("tab", { name: /^Sa\b/i }),
    page.getByRole("tab", { name: /^So\b/i }),
  ];

  for (const tab of weekendTabs) {
    if ((await tab.count()) === 0) continue;
    await tab.click();
    const panel = page.locator('[role="tabpanel"]:visible').first();
    const addButton = panel.getByRole("button", { name: "Eintrag hinzufügen" }).first();
    if ((await addButton.count()) > 0) {
      await addButton.click();
      await expect(
        page.getByRole("heading", { level: 2, name: "Eintrag bearbeiten" }),
      ).toBeVisible();
      return;
    }
    const existingButton = panel.locator("article").first().locator("button").last();
    if ((await existingButton.count()) > 0) {
      await existingButton.click();
      await expect(
        page.getByRole("heading", { level: 2, name: "Eintrag bearbeiten" }),
      ).toBeVisible();
      return;
    }
  }

  throw new Error(
    "Kein Wochenend-Feld gefunden (weder Samstag noch Sonntag).",
  );
}

function employeeNameFromDialog(page: Page): Locator {
  return page.locator('[role="dialog"] p').first();
}

async function reopenWeekendEntryForEmployee(
  page: Page,
  employeeName: string,
): Promise<void> {
  const panel = page.locator('[role="tabpanel"]:visible').first();
  await panel
    .locator("article")
    .filter({ hasText: employeeName })
    .first()
    .locator("button")
    .last()
    .click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Eintrag bearbeiten" }),
  ).toBeVisible();
}

test.describe("Admin Planning: Wochenend-Klassifikation", () => {
  test("persistiert 'Zusätzliche Wochenendarbeit' im Wochenend-Dialog", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsSeedAdmin(page);

    await page.goto("/planning");
    await expect(
      page.getByRole("heading", { level: 1, name: "Wochenplanung" }),
    ).toBeVisible();

    await openWeekendCellDialog(page);
    const employeeName = (
      (await employeeNameFromDialog(page).textContent()) ?? ""
    )
      .split("·")[0]
      ?.trim();
    expect(employeeName.length).toBeGreaterThan(0);

    await expect(page.getByText("Wochenendarbeit", { exact: true })).toBeVisible();
    await page
      .getByLabel("Zusätzliche Wochenendarbeit")
      .check();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Eintrag gespeichert.")).toBeVisible();

    await reopenWeekendEntryForEmployee(page, employeeName);
    await expect(page.getByLabel("Zusätzliche Wochenendarbeit")).toBeChecked();
  });

  test("kann zwischen REGULAR_SHIFTED und ADDITIONAL umschalten und persistiert beide Zustände", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsSeedAdmin(page);

    await page.goto("/planning");
    await expect(
      page.getByRole("heading", { level: 1, name: "Wochenplanung" }),
    ).toBeVisible();

    await openWeekendCellDialog(page);
    const employeeName = (
      (await employeeNameFromDialog(page).textContent()) ?? ""
    )
      .split("·")[0]
      ?.trim();
    expect(employeeName.length).toBeGreaterThan(0);
    await expect(page.getByText("Wochenendarbeit", { exact: true })).toBeVisible();

    // Start explizit mit REGULAR_SHIFTED und speichern.
    await page.getByLabel("Regulär verschobener Arbeitstag").check();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Eintrag gespeichert.")).toBeVisible();

    await reopenWeekendEntryForEmployee(page, employeeName);
    await expect(page.getByLabel("Regulär verschobener Arbeitstag")).toBeChecked();

    // Auf ADDITIONAL umstellen und Persistenz prüfen.
    await page.getByLabel("Zusätzliche Wochenendarbeit").check();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Eintrag gespeichert.")).toBeVisible();

    await reopenWeekendEntryForEmployee(page, employeeName);
    await expect(page.getByLabel("Zusätzliche Wochenendarbeit")).toBeChecked();
  });
});
