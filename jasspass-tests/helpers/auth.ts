import { expect, Page } from '@playwright/test';
import {
  PLAYWRIGHT_BOT_EMAIL,
  PLAYWRIGHT_BOT_PASSWORD,
  JASS_TEST_URL,
} from '../constants';

async function gotoSignIn(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
  } catch (error) {
    console.warn(`Sign-in navigation failed once; retrying: ${error}`);
    await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
  }
}

export async function signIn(
  page: Page,
  {
    baseURL = JASS_TEST_URL,
    email = PLAYWRIGHT_BOT_EMAIL,
    password = PLAYWRIGHT_BOT_PASSWORD,
    targetPath = '/portal/organizer',
  } = {}
) {
  await gotoSignIn(page, baseURL + '/signin');

  const emailInput = page.getByRole('textbox', { name: 'Email' });
  const emailInputVisible = await emailInput
    .isVisible({ timeout: 30000 })
    .catch(() => false);

  if (!emailInputVisible) {
    await page.goto(`${baseURL}${targetPath}`, { waitUntil: 'domcontentloaded' });

    if (!new URL(page.url()).pathname.includes('/signin')) {
      return;
    }

    const redirectedEmailInputVisible = await emailInput
      .isVisible({ timeout: 15000 })
      .catch(() => false);

    if (!redirectedEmailInputVisible) {
      await gotoSignIn(page, baseURL + '/signin');
    }

    await expect(emailInput).toBeVisible({ timeout: 30000 });
  }

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
  await page.waitForFunction(
    () => {
      const persistedAuth = window.localStorage.getItem('persist:auth');
      if (!persistedAuth) return false;
      try {
        const auth = JSON.parse(persistedAuth) as { loggedIn?: string };
        return auth.loggedIn === 'true';
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 30_000 }
  );
  await page.waitForURL((url) => url.pathname.startsWith('/portal/'), {
    timeout: 30_000,
  });
  await expect(
    page
      .getByRole('button', { name: 'Discover Events', exact: true })
      .filter({ visible: true })
  ).toBeVisible({ timeout: 30_000 });

  const targetUrl = `${baseURL}${targetPath}`;
  if (page.url() !== targetUrl) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  }
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
