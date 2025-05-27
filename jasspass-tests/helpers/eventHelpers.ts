import { Page } from '@playwright/test';
import {
  JASS_TEST_CHANGE_ORG_URL,
  PLAYWRIGHT_BOT_EMAIL,
  ORGANIZER_NAME_PREFIX,
  getRandomCountry,
  CONTACT_NAME,
  CONTACT_ADDRESS,
  CONTACT_PHONE_NUMBER,
} from '../constants';
import { signIn } from './auth';
import { createOrganizer } from './organizerHelpers';
import { fillIndividualStripeFields } from './stripeHelpers';

export async function createEvent(
  page: Page,
  {
    eventName = ORGANIZER_NAME_PREFIX +
      'Event-' +
      Math.random().toString(36).substring(2, 15),
  } = {}
): Promise<string> {
  // log in and open the create-organizer form
  await signIn(page);

  // wait for 0.5 seconds
  await page.waitForTimeout(500);

  await createOrganizer(page);

  await page.getByRole('button', { name: 'New Event' }).click();

  //wait for 0.5 seconds
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: "No, it's paid" }).click();
  await page.getByRole('button', { name: 'Fill Default Values' }).click();

  // Change the event name
  await page.getByRole('textbox', { name: 'Event Title' }).click();
  await page.getByRole('textbox', { name: 'Event Title' }).fill(eventName);
  await page.getByRole('link', { name: 'Additional Details' }).click();

  //wait for 1 second
  await page.waitForTimeout(1000);

  await page.getByText('Publish').click();
  await page.getByRole('button', { name: 'Publish as Live Event' }).click();

  //wait for 5 seconds
  await page.waitForTimeout(5000);

  const url = page.url();
  console.log(`New event URL: ${url}`);

  // 3) extract the ID with your regex pattern
  const match = url.match(/event\/([^/]+)/);
  if (!match) {
    throw new Error(`Could not parse event ID from URL: ${url}`);
  }
  return match[1];
}

export async function purchaseTicket(page: Page) {
  // Create event
  await createEvent(page);

  // Select ticket and proceed
  await page.getByRole('combobox').selectOption('1');
  await page.getByRole('button', { name: 'Buy Tickets' }).click();

  // Fill buyer information
  await page.getByRole('textbox', { name: 'First Name *' }).fill(CONTACT_NAME);
  await page.getByRole('textbox', { name: 'Last Name *' }).fill('Client');
  await page
    .getByRole('textbox', { name: 'Email Address *' })
    .fill(PLAYWRIGHT_BOT_EMAIL);
  await page.locator('#phone-input').fill(CONTACT_PHONE_NUMBER);

  // Wait briefly to ensure Stripe iframes are loaded
  await page.waitForTimeout(1000);

  // Fill Stripe card fields
  await fillIndividualStripeFields(page);

  // Accept terms and pay
  await page
    .getByRole('checkbox', { name: 'I have read and agree to the' })
    .check();
  await page.getByRole('button', { name: 'Checkout' }).click();

  //Wait for 5 seconds
  await page.waitForTimeout(5000);

  // Go to success page and trigger ticket confirmation
  await page.waitForURL(/\/payment\/success\//);
  await page.getByRole('img', { name: 'Ticket QR Code' }).click();
}
