import { expect, Page } from '@playwright/test';
import {
  PLAYWRIGHT_BOT_EMAIL,
  PLAYWRIGHT_BOT_PASSWORD,
  JASS_TEST_URL,
} from '../constants';

const pagesWithDateOfBirthHandler = new WeakSet<Page>();

export async function installDateOfBirthPromptHandler(page: Page) {
  if (pagesWithDateOfBirthHandler.has(page)) return;

  const remindMeLater = page.getByRole('button', {
    name: 'Remind me later',
    exact: true,
  });
  await page.addLocatorHandler(remindMeLater, async () => {
    await remindMeLater.click();
    await expect(remindMeLater).toBeHidden();
  });
  pagesWithDateOfBirthHandler.add(page);
}

export async function dismissDateOfBirthPromptIfPresent(
  page: Page,
  timeout = 3_000
) {
  await installDateOfBirthPromptHandler(page);
  const remindMeLater = page.getByRole('button', {
    name: 'Remind me later',
    exact: true,
  });
  const promptIsVisible = await remindMeLater
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);

  if (promptIsVisible) {
    await expect(remindMeLater).toBeHidden();
  }
}

async function gotoSignIn(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
}

async function expectSignedInPortal(page: Page) {
  await page.waitForURL((url) => url.pathname.startsWith('/portal/'), {
    timeout: 12_000,
  });
  await expect(
    page
      .getByRole('button', { name: 'Sign Out', exact: true })
      .filter({ visible: true })
      .first()
  ).toBeVisible({ timeout: 12_000 });
}

export async function signIn(
  page: Page,
  {
    baseURL = JASS_TEST_URL,
    email = PLAYWRIGHT_BOT_EMAIL,
    password = PLAYWRIGHT_BOT_PASSWORD,
    targetPath = '/portal/home',
  } = {}
) {
  await installDateOfBirthPromptHandler(page);
  await gotoSignIn(page, baseURL + '/signin');

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
  if (!loginResponse.ok()) {
    const loginResponseBody = await loginResponse
      .text()
      .catch(() => '<response body unavailable>');
    throw new Error(
      `Login failed with ${loginResponse.status()} ${loginResponse.statusText()}: ${loginResponseBody}`
    );
  }

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
  if (!new URL(page.url()).pathname.startsWith('/portal/')) {
    await page.goto(`${baseURL}/portal/home`, {
      waitUntil: 'domcontentloaded',
    });
  }
  await expectSignedInPortal(page);

  const targetUrl = `${baseURL}${targetPath}`;
  const currentUrl = new URL(page.url());
  if (`${currentUrl.pathname}${currentUrl.search}` !== targetPath) {
    // Use a real document navigation. Protected routes must survive direct
    // entry and refresh; a client-side transition would hide rehydration bugs.
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(targetUrl, { timeout: 30_000 });
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
