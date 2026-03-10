import { Page } from '@playwright/test';
import { constants } from 'buffer';
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
  } = {}
) {
  await page.goto(baseURL + '/signin');
  //wait for 0.5 seconds
  await page.waitForTimeout(500);

  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function signOutIfSignedIn(page: Page) {
  try {
    // Try to find and click the profile dropdown
    const profileDropdown = page.getByRole('button').filter({ hasText: /^$/ });
    if ((await profileDropdown.count()) > 0) {
      await profileDropdown.click();
      const signOutOption = page.locator('div').filter({ hasText: /^Sign Out$/ }).first();
      if ((await signOutOption.count()) > 0) {
        await signOutOption.click();
      }
    }
  } catch (error) {
    console.log('Already signed out or sign out failed:', error);
  }
}
