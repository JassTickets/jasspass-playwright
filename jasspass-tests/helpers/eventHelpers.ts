import { expect, Page } from '@playwright/test';
import {
  JASS_TEST_CHANGE_ORG_URL,
  PLAYWRIGHT_BOT_EMAIL,
  ORGANIZER_NAME_PREFIX,
  getRandomCountry,
  CONTACT_NAME,
  CONTACT_ADDRESS,
  CONTACT_PHONE_NUMBER,
  JASS_TEST_URL,
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
  //Timeout for 3 seconds
  await page.waitForTimeout(3000);
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

  //wait for 5 seconds
  await page.waitForTimeout(5000);

  await page.getByText('Publish').click();
  await page.getByRole('button', { name: 'Publish as Live Event' }).click();

  //wait for 5 seconds
  await page.waitForTimeout(5000);

  const url = page.url();
  console.log(`New event URL: ${url}`);

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

  // Accept terms and pay
  await page
    .locator('div')
    .filter({ hasText: /^I have read and agree to the Terms and Conditions$/ })
    .locator('#tosAccepted')
    .check();

  await page.getByRole('button', { name: 'Proceed to Payment' }).click();

  // Wait briefly to ensure Stripe iframes are loaded
  await page.waitForTimeout(3000);

  // Fill Stripe card fields
  await fillIndividualStripeFields(page);

  //wait 2 seconds
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Checkout' }).click();

  //Wait for 5 seconds
  await page.waitForTimeout(5000);

  // Go to success page and trigger ticket confirmation
  await page.waitForURL(/\/payment\/success\//);

  // Close the modal (if any):
  try {
    await page.getByRole('button', { name: 'Close' }).click();
  } catch {
    // Don't do anything
  }
  await page.getByRole('img', { name: 'Ticket QR Code' }).click();
}

export async function refundTicket(page: Page) {
  // Purchase a ticket first
  await purchaseTicket(page);

  // Extract the event ID and confirmation number from the URL
  const currentUrl = page.url();

  const parts = currentUrl.split('/');
  const confirmation = parts.pop();
  const eventId = parts.pop();

  console.log('Event ID: ', eventId);
  console.log('Confirmation #: ', confirmation);

  // Go to event page
  await page.goto(`${JASS_TEST_URL}/event/${eventId}`);

  // Go to organizer view
  const page1Promise = page.waitForEvent('popup');
  await page.getByText('Organizer View').click();
  const page1 = await page1Promise;

  //Wait for one second
  await page1.waitForTimeout(1000);

  // Go to Orders & Attendees
  await page1.getByRole('link', { name: 'Orders & Attendees' }).click();
  await page1.getByRole('textbox', { name: 'Search Orders' }).click();

  await page1
    .getByRole('textbox', { name: 'Search Orders' })
    .fill(confirmation || '');

  await page1.getByRole('cell', { name: confirmation }).click();

  await page1
    .getByRole('row', { name: 'Ticket Ticket ID Price' })
    .getByRole('checkbox')
    .check();
  await page1.getByRole('textbox', { name: 'Refund details...' }).click();
  await page1
    .getByRole('textbox', { name: 'Refund details...' })
    .fill('Playwright Refund');
  await page1.getByRole('button', { name: 'Submit Refund' }).click();
  const successBanner = page1.getByText('Refund submitted successfully.');

  // Return success banner
  return { page1, successBanner };
}

export async function deleteEvent(page: Page) {
  // Do e2e flow up until now: create organizer, create event, purchase ticket, refund ticket
  const { page1 } = await refundTicket(page);

  // Now that the ticket is refunded, we can safely delete the event
  // Wait for 5 seconds to ensure the refund is processed
  await page1.waitForTimeout(5000);

  // Close the sidebar by refreshing the page
  try {
    await page1.getByRole('button', { name: '×' }).click();
  } catch {
    // Just refresh the page
    try {
      await page1.reload();
    } catch {
      //Get the current url
      const currentUrl = page1.url();
      await page1.goto(JASS_TEST_URL);
      await page1.goto(currentUrl);
    }
  }

  // Go to the event settings
  await page1.getByRole('link', { name: 'Event Settings' }).click();
  await page1.getByRole('button', { name: 'Delete Event' }).click();
  await page1.getByRole('button', { name: 'Delete' }).click();

  return { page1 };
}
