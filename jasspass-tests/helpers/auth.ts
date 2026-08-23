import { expect, Page } from '@playwright/test';
import {
  PLAYWRIGHT_BOT_EMAIL,
  PLAYWRIGHT_BOT_PASSWORD,
  JASS_TEST_URL,
} from '../constants';

export async function dismissDateOfBirthPromptIfPresent(
  page: Page,
  timeout = 3_000
) {
  const remindMeLater = page.getByRole('button', {
    name: 'Remind me later',
    exact: true,
  });
  const promptIsVisible = await remindMeLater
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);

  if (promptIsVisible) {
    await remindMeLater.click();
    await expect(remindMeLater).toBeHidden();
  }
}

async function gotoSignIn(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
  } catch (error) {
    console.warn(`Sign-in navigation failed once; retrying: ${error}`);
    await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
  }
}

async function expectSignedInPortal(page: Page) {
  await page.waitForURL((url) => url.pathname.startsWith('/portal/'), {
    timeout: 30_000,
  });
  await expect(
    page
      .getByRole('button', { name: 'Sign Out', exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible({ timeout: 30_000 });
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
      await expectSignedInPortal(page);
      await dismissDateOfBirthPromptIfPresent(page);
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
  await expectSignedInPortal(page);

  const targetUrl = `${baseURL}${targetPath}`;
  if (page.url() !== targetUrl) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  }
  await expectSignedInPortal(page);
  await dismissDateOfBirthPromptIfPresent(page);
}

export async function signOutIfSignedIn(page: Page) {
  const signOut = page
    .getByRole('button', { name: 'Sign Out', exact: true })
    .filter({ visible: true })
    .first();
  if (!(await signOut.isVisible({ timeout: 3_000 }).catch(() => false))) return;

  await signOut.click();
  await page.waitForURL((url) => url.pathname.includes('/signin'), {
    timeout: 30_000,
  });
}
