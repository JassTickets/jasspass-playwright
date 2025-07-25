// tests/helpers/organizers.ts
import { Page } from '@playwright/test';
import {
  JASS_TEST_CHANGE_ORG_URL,
  PLAYWRIGHT_BOT_EMAIL,
  ORGANIZER_NAME_PREFIX,
  getRandomCountry,
  CONTACT_NAME,
  CONTACT_ADDRESS,
  CONTACT_PHONE_NUMBER,
  PLAYWRIGHT_BOT_STRIPE_CONNECT_ID,
} from '../constants';
import { signIn } from './auth';
import { deleteEvent } from './eventHelpers';

// Create Organizer is an independent test. It will only require sign-in
export async function createOrganizer(
  page: Page,
  {
    email = PLAYWRIGHT_BOT_EMAIL,
    organizerName = ORGANIZER_NAME_PREFIX +
      Math.random().toString(36).substring(2, 15),
  } = {}
): Promise<string> {
  await page.goto(JASS_TEST_CHANGE_ORG_URL);
  await page.getByRole('button', { name: 'Create Organizer Profile' }).click();

  // fill out fields
  await page
    .getByRole('textbox', { name: 'Organizer Profile Name *' })
    .fill(organizerName);
  await page.getByLabel('Select country').selectOption(getRandomCountry());
  await page
    .getByRole('textbox', { name: 'Contact Name *' })
    .fill(CONTACT_NAME);
  await page
    .getByRole('textbox', { name: 'Organizer Profile Email *' })
    .fill(email);
  await page.locator('#phone-input').fill(CONTACT_PHONE_NUMBER);
  await page
    .getByRole('textbox', { name: 'Organizer Address *' })
    .fill(CONTACT_ADDRESS);

  // submit and wait for navigation to the new organizer’s page
  await page.getByRole('button', { name: 'Create Organizer' }).click();

  //wait for 2 seconds
  await page.waitForTimeout(2000);

  // change the Stripe Connect ID to point to the onboarded Playwright bot's Stripe Connect ID
  await page.getByRole('textbox', { name: 'acct_xxx...' }).click();
  await page
    .getByRole('textbox', { name: 'acct_xxx...' })
    .fill(PLAYWRIGHT_BOT_STRIPE_CONNECT_ID);
  await page.getByRole('button', { name: 'Save' }).click();

  // parse out the ID from the URL
  const url = page.url();

  console.log(`New organizer URL: ${url}`);
  const match = url.match(/company\/([^/]+)/);
  if (!match) {
    throw new Error(`Could not parse organizer ID from URL: ${url}`);
  }
  return match[1];
}

export async function deleteOrganizer(
  page: Page,
  independentTest: boolean,
  {
    email = PLAYWRIGHT_BOT_EMAIL,
    organizerName = ORGANIZER_NAME_PREFIX +
      Math.random().toString(36).substring(2, 15),
  } = {}
) {
  // This will delete the event, ensuring that the organizer can be deleted
  const { page1 } = await deleteEvent(page, independentTest);
  // Wait for 3 seconds
  await page1.waitForTimeout(3000);

  await page1.getByRole('link', { name: 'Manage' }).click();
  await page1.getByRole('button', { name: 'Delete' }).click();
  await page1.getByRole('button', { name: 'Delete' }).click();
}
