import type { Page } from "@playwright/test";
import { loginOnPage } from "./login-helper";
import {
  testAdminCredentials,
  testEmployeeCredentials,
} from "./credentials";

/**
 * Bekannter Datenstand nach `prisma/seed` (Slug „default“, Demo-Admin/-Mitarbeitende).
 */

export async function loginAsSeedAdmin(page: Page): Promise<void> {
  await loginOnPage(page, testAdminCredentials);
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
}

export async function loginAsSeedEmployee(page: Page): Promise<void> {
  await loginOnPage(page, testEmployeeCredentials);
  await page.waitForURL(/\/my-week/, { timeout: 15_000 });
}
