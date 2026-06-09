import { expect, Page } from '@playwright/test';
import {
  PLAYWRIGHT_BOT_EMAIL,
  PLAYWRIGHT_BOT_PASSWORD,
  JASS_TEST_URL,
} from '../constants';

export async function signIn(
  page: Page,
  {
    baseURL = JASS_TEST_URL,
    email = PLAYWRIGHT_BOT_EMAIL,
    password = PLAYWRIGHT_BOT_PASSWORD,
    targetPath = '/portal/organizer',
  } = {}
) {
  await page.goto(baseURL + '/signin', { waitUntil: 'domcontentloaded' });

  const emailInput = page.getByRole('textbox', { name: 'Email' });
  await expect(emailInput).toBeVisible({ timeout: 30000 });
  await emailInput.fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/public/auth/login')
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.ok()).toBeTruthy();

  await page.waitForURL((url) => !url.pathname.includes('/signin'), {
    timeout: 30000,
  });
  await page.goto(`${baseURL}${targetPath}`, { waitUntil: 'domcontentloaded' });
}

export async function signOutIfSignedIn(page: Page) {
  try {
    // Try to find and click the profile dropdown
    const profileDropdown = page.getByRole('button').filter({ hasText: /^$/ });
    if ((await profileDropdown.count()) > 0) {
      await profileDropdown.click();
      const signOutOption = page
        .locator('div')
        .filter({ hasText: /^Sign Out$/ })
        .first();
      if ((await signOutOption.count()) > 0) {
        await signOutOption.click();
      }
    }
  } catch (error) {
    console.log('Already signed out or sign out failed:', error);
  }
}
