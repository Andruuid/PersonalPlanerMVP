import { expect, type Page } from "@playwright/test";
import { loginOnPage } from "./login-helper";
import {
  testAdminCredentials,
  testEmployeeCredentials,
} from "./credentials";

/**
 * Bekannter Datenstand nach `prisma/seed` — Demo-Admin/-Mitarbeitende.
 */

export async function loginAsSeedAdmin(page: Page): Promise<void> {
  await loginOnPage(page, testAdminCredentials);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/dashboard");
    if (page.url().includes("/dashboard")) break;
    await page.waitForTimeout(300);
  }
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function loginAsSeedEmployee(page: Page): Promise<void> {
  await loginOnPage(page, testEmployeeCredentials);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/my-week");
    if (page.url().includes("/my-week")) break;
    await page.waitForTimeout(300);
  }
  await expect(page).toHaveURL(/\/my-week/);
}
