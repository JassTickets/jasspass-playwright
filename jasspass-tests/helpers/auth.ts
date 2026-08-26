import { expect, Page } from '@playwright/test';
import {
  PLAYWRIGHT_BOT_EMAIL,
  PLAYWRIGHT_BOT_PASSWORD,
  JASS_TEST_URL,
} from '../constants';

export const DOB_PROMPT_DISMISS_KEY = 'dobPromptDismissed';

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
    return;
  }

  // The profile request that decides whether to show this prompt can finish
  // after a busy CI runner's timeout. Preserve the same "remind me later"
  // session state so a late response cannot cover the portal mid-test.
  await page.evaluate((dismissKey) => {
    window.sessionStorage.setItem(dismissKey, '1');
  }, DOB_PROMPT_DISMISS_KEY);
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
    attempt = 0,
  } = {}
) {
  await gotoSignIn(page, baseURL + '/signin');

  const emailInput = page.getByRole('textbox', { name: 'Email' });
  const emailInputVisible = await emailInput
    .isVisible({ timeout: 30000 })
    .catch(() => false);

  if (!emailInputVisible) {
    await page.goto(`${baseURL}${targetPath}`, {
      waitUntil: 'domcontentloaded',
    });

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
  // The login component persists Redux immediately before replacing `/`.
  // Let that document navigation and the destination hydration settle before
  // forcing a protected destination, or the destination can observe the
  // pre-hydration `loggedIn=false` state.
  await page.waitForTimeout(300);
  if (!new URL(page.url()).pathname.startsWith('/portal/')) {
    await page.goto(`${baseURL}/portal/home`, {
      waitUntil: 'domcontentloaded',
    });
  }
  try {
    await expectSignedInPortal(page);
  } catch (error) {
    if (attempt >= 2) throw error;
    await page.context().clearCookies({ name: 'access_token' });
    return signIn(page, {
      baseURL,
      email,
      password,
      targetPath,
      attempt: attempt + 1,
    });
  }

  const targetUrl = `${baseURL}${targetPath}`;
  const currentUrl = new URL(page.url());
  if (`${currentUrl.pathname}${currentUrl.search}` !== targetPath) {
    // Keep this as a client-side App Router transition. A document reload of
    // protected organizer routes can run their mount-time auth guard before
    // redux-persist rehydrates, which makes the UI log out a valid session.
    await page.evaluate((path) => {
      const appRouter = (window as Window & {
        next?: { router?: { push: (href: string) => void } };
      }).next?.router;
      if (!appRouter) throw new Error('Next.js App Router is unavailable.');
      appRouter.push(path);
    }, targetPath);
    await page.waitForURL(targetUrl, { timeout: 30_000 });
  }
  try {
    await expectSignedInPortal(page);
  } catch (error) {
    if (attempt >= 2) throw error;
    await page.context().clearCookies({ name: 'access_token' });
    return signIn(page, {
      baseURL,
      email,
      password,
      targetPath,
      attempt: attempt + 1,
    });
  }
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
