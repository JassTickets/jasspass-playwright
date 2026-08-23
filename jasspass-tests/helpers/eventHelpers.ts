import { expect, Locator, Page } from '@playwright/test';
import {
  JASS_TEST_CHANGE_ORG_URL,
  PLAYWRIGHT_BOT_EMAIL,
  ORGANIZER_NAME_PREFIX,
  getRandomCountry,
  CONTACT_NAME,
  CONTACT_ADDRESS,
  NEW_CONTACT_ADDRESS,
  CONTACT_PHONE_NUMBER,
  JASS_TEST_URL,
  EVENT_NAME_PREFIX,
  EVENT_NEW_TITLE,
  EVENT_NEW_DESCRIPTION,
  EVENT_NEW_ADDRESS,
  EVENT_NEW_CITY,
  EVENT_NEW_VENUE,
  EVENT_NEW_ADDITIONAL_DETAILS,
  EVENT_NEW_TAX_RATE,
  EVENT_PLAYWRIGHT_PROMO_CODE,
  EVENT_PROMO_DISCOUNT,
  EVENT_PROMO_LIMIT,
  ATTENDEE_FIRST_NAME,
  ATTENDEE_LAST_NAME,
  ATTENDEE_EMAIL,
  ATTENDEE_PHONE,
  MESSAGE_SUBJECT,
  MESSAGE_BODY,
} from '../constants';
import { signIn } from './auth';
import { createOrganizer } from './organizerHelpers';
import { fillIndividualStripeFields } from './stripeHelpers';
import {
  openEventPortalDestination,
  openOrganizerSurface,
} from './portalNavigationHelpers';

// Helper function to generate unique promo code with timestamp
function generateUniquePromoCode(): string {
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
  return `${EVENT_PLAYWRIGHT_PROMO_CODE}${timestamp}`;
}

// Helper function to search and click a specific event promo code
async function searchAndClickEventPromoCode(
  organizerPage: Page,
  promoCode: string
): Promise<void> {
  await organizerPage
    .getByRole('textbox', { name: 'Search Promo Codes' })
    .click();
  await organizerPage
    .getByRole('textbox', { name: 'Search Promo Codes' })
    .fill(promoCode);

  const promoCodeCell = organizerPage.getByRole('cell', { name: promoCode });
  await expect(promoCodeCell).toBeVisible({ timeout: 30000 });
  await promoCodeCell.click();
  console.log(`Found and clicked event promo code "${promoCode}" using search`);
}

async function createPromoCodeInManagementModalAndAddToEvent(
  organizerPage: Page,
  promoCode: string
): Promise<void> {
  const promoCodeModal = organizerPage
    .locator('div.fixed.inset-0.z-\\[9999\\]')
    .filter({
      has: organizerPage.getByRole('heading', { name: 'Manage Promo Codes' }),
    })
    .last();
  await expect(promoCodeModal).toBeVisible({ timeout: 30000 });

  await promoCodeModal
    .getByRole('textbox', { name: 'Enter promo code' })
    .fill(promoCode);
  await promoCodeModal.getByRole('spinbutton').fill(EVENT_PROMO_DISCOUNT);

  const createPromoCodeResponsePromise = organizerPage.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/protected/organizers/') &&
      response.url().includes('/promocodes') &&
      !response.url().includes('/attachments'),
    { timeout: 30000 }
  );
  const refreshedPromoCodesResponsePromise = organizerPage.waitForResponse(
    async (response) => {
      if (
        response.request().method() !== 'GET' ||
        !response.url().includes('/api/protected/organizers/') ||
        !response.url().includes('/promocodes') ||
        response.url().includes('/attachments')
      ) {
        return false;
      }

      return (await response.text().catch(() => '')).includes(promoCode);
    },
    { timeout: 30000 }
  );

  await promoCodeModal
    .locator('form')
    .getByRole('button', { name: 'Add Promo Code' })
    .click();
  const createPromoCodeResponse = await createPromoCodeResponsePromise;
  expect(createPromoCodeResponse.ok()).toBeTruthy();
  const refreshedPromoCodesResponse = await refreshedPromoCodesResponsePromise;
  expect(refreshedPromoCodesResponse.ok()).toBeTruthy();

  const modalSearch = promoCodeModal.getByRole('textbox', {
    name: 'Search your organizer promo',
  });
  await expect(modalSearch).toBeVisible({ timeout: 30000 });
  await modalSearch.fill(promoCode);

  await expect(
    promoCodeModal.getByText(promoCode, { exact: true }).first()
  ).toBeVisible({ timeout: 30000 });
  await promoCodeModal
    .getByRole('button', { name: 'Add to Event' })
    .first()
    .click();
}

// Helper function to find and click a specific promo code using search
async function findAndClickPromoCode(
  organizerPage: Page,
  promoCode: string
): Promise<boolean> {
  try {
    await searchAndClickEventPromoCode(organizerPage, promoCode);
    return true;
  } catch (error) {
    console.warn(`Promo code "${promoCode}" not found using search: ${error}`);
    return false;
  }
}

async function reloadStaleEventDataIfPresent(organizerPage: Page) {
  const overlay = organizerPage.locator('.absolute.inset-0.z-10.bg-black\\/60');
  let reloadButton = organizerPage.getByRole('button', { name: /reload/i });
  if (await reloadButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    try {
      await reloadButton.click({ timeout: 3000 });
    } catch {
      reloadButton = organizerPage.getByRole('button', { name: /reload/i });
      if (
        (await overlay.count()) > 0 &&
        (await reloadButton.isVisible({ timeout: 1000 }).catch(() => false))
      ) {
        await reloadButton.click({ timeout: 3000 }).catch(() => undefined);
      }
    }
  }

  await expect(overlay).toHaveCount(0, { timeout: 15000 });
}

function visibleStudioSheet(page: Page, title: string) {
  return page
    .getByRole('heading', { name: title, exact: true })
    .filter({ visible: true })
    .locator('xpath=ancestor::div[contains(@class,"pointer-events-auto")][1]');
}

export function visibleModalShell(page: Page, title: string) {
  return page
    .getByText(title, { exact: true })
    .filter({ visible: true })
    .first()
    .locator('xpath=ancestor::div[contains(@class,"pointer-events-auto")][1]');
}

async function attachPromoCodeToAllTicketTypes(page: Page) {
  const attachModal = visibleModalShell(page, 'Attach Ticket Type');
  await expect(attachModal).toBeVisible({ timeout: 30_000 });
  await attachModal
    .getByRole('checkbox', { name: 'Attach to All Ticket Types' })
    .check();

  const attachResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/promocodes/ticket-types/') &&
      response.url().endsWith('/attach'),
    { timeout: 30_000 },
  );
  await attachModal
    .getByRole('button', { name: 'Attach', exact: true })
    .click();
  expect((await attachResponsePromise).ok()).toBeTruthy();
  await expect(attachModal).toBeHidden({ timeout: 30_000 });
}

async function selectOrganizerTicketAndContinue(page: Page) {
  const bookingModal = visibleModalShell(page, 'Select Tickets');
  await expect(bookingModal).toBeVisible({ timeout: 30_000 });
  await bookingModal
    .getByRole('button', { name: /^Increase quantity for / })
    .first()
    .click();
  await bookingModal
    .getByRole('button', { name: 'Get Tickets', exact: true })
    .click();
  await expect(bookingModal.locator('#FirstName')).toBeVisible({
    timeout: 30_000,
  });
  return bookingModal;
}

function waitForEventDetailsRefresh(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      /\/api\/protected\/events\/[^/]+$/.test(new URL(response.url()).pathname),
    { timeout: 30_000 }
  );
}

async function openOrdersAndAttendees(organizerPage: Page): Promise<void> {
  const ordersSearch = organizerPage.getByPlaceholder('Search Orders');

  await openEventPortalDestination(organizerPage, 'ordersAndAttendees');
  await expect(ordersSearch).toBeVisible({ timeout: 30_000 });
}

async function openMessageAttendees(organizerPage: Page): Promise<Locator> {
  const toolsButton = organizerPage
    .locator('button:visible')
    .filter({ hasText: /^Tools$/ })
    .first();
  const messageAttendeesButton = organizerPage
    .locator('button:visible')
    .filter({ hasText: /Message Attendees/ })
    .first();

  await expect(toolsButton).toBeVisible({ timeout: 30_000 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await toolsButton.click();
    if (
      await messageAttendeesButton
        .isVisible({ timeout: 5_000 })
        .catch(() => false)
    ) {
      break;
    }
  }

  await expect(messageAttendeesButton).toBeVisible({ timeout: 30_000 });
  await messageAttendeesButton.click();
  const messageModal = visibleModalShell(organizerPage, 'Message Attendees');
  await expect(messageModal).toBeVisible({ timeout: 30_000 });
  await expect(
    messageModal.getByRole('textbox', {
      name: 'Enter the subject...',
    })
  ).toBeVisible({ timeout: 30_000 });
  return messageModal;
}

export async function createEvent(
  page: Page,
  {
    eventName = ORGANIZER_NAME_PREFIX +
      'Event-' +
      Math.random().toString(36).substring(2, 15),
  } = {}
): Promise<string> {
  const organizerId = await createOrganizer(page);
  await openOrganizerSurface(page, 'events');

  const newEventButton = page
    .getByRole('button', { name: 'New Event', exact: true })
    .filter({ visible: true })
    .first();
  await expect(newEventButton).toBeVisible({ timeout: 30_000 });
  await newEventButton.click();
  await expect(page).toHaveURL(/\/portal\/create-event(?:\?|$)/, {
    timeout: 30_000,
  });

  const title = page.getByPlaceholder('Event title');
  await expect(title).toBeVisible({ timeout: 30_000 });
  await title.fill(eventName);

  const eventImageResponse = await page.request.get(
    `${JASS_TEST_URL}/gallery/photo1.jpg`,
  );
  expect(eventImageResponse.ok(), 'Load event fixture image').toBeTruthy();
  const eventImageBuffer = await eventImageResponse.body();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add flyer', exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'photo1.jpg',
    mimeType: 'image/jpeg',
    buffer: eventImageBuffer,
  });

  const locationRow = page
    .getByRole('button')
    .filter({ hasText: /Set the location/ })
    .filter({ visible: true })
    .first();
  await expect(locationRow).toBeVisible();
  await locationRow.click();
  await expect(
    page.getByRole('heading', { name: 'Where is it?', exact: true }),
  ).toBeVisible();

  const locationSearch = page
    .getByPlaceholder('Search venue or address')
    .filter({ visible: true })
    .first();
  const autocompleteResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/places-autocomplete',
    { timeout: 30_000 },
  );
  await locationSearch.fill(NEW_CONTACT_ADDRESS);
  const autocompleteResponse = await autocompleteResponsePromise;
  expect(
    autocompleteResponse.ok(),
    `Location autocomplete failed with ${autocompleteResponse.status()}`,
  ).toBeTruthy();

  const locationSearchRoot = locationSearch.locator('xpath=../..');
  const locationSuggestion = locationSearchRoot.getByRole('button').first();
  await expect(locationSuggestion).toBeVisible({ timeout: 15_000 });
  const locationDetailsResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/places-details',
    { timeout: 30_000 },
  );
  await locationSuggestion.click();
  const locationDetailsResponse = await locationDetailsResponsePromise;
  expect(
    locationDetailsResponse.ok(),
    `Location details failed with ${locationDetailsResponse.status()}`,
  ).toBeTruthy();
  await page
    .getByRole('button', { name: 'Done', exact: true })
    .filter({ visible: true })
    .click();

  await page
    .getByRole('button', { name: 'Add a ticket type', exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'New ticket type', exact: true }),
  ).toBeVisible();
  await page
    .locator('#tier-name:visible')
    .first()
    .fill('General Admission Playwright');
  await page.locator('#tier-price:visible').first().fill('55');
  await page.locator('#tier-quantity:visible').first().fill('100');
  await page
    .getByRole('button', { name: 'Add ticket type', exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByText('General Admission Playwright', { exact: true }),
  ).toBeVisible();

  const createDraftResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname ===
        `/api/protected/events/${organizerId}/draft`,
    { timeout: 45_000 },
  );
  const createEventResponsePromise = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname.replace(/\/$/, '');
    return (
      response.request().method() === 'POST' &&
      pathname === '/api/protected/events'
    );
  }, { timeout: 90_000 });

  const publishButton = page
    .getByRole('button', { name: 'Publish', exact: true })
    .filter({ visible: true });
  await expect(publishButton).toBeEnabled({ timeout: 30_000 });
  await publishButton.click();

  const createDraftResponse = await createDraftResponsePromise;
  if (!createDraftResponse.ok()) {
    const body = await createDraftResponse.text().catch(() => '<unreadable>');
    throw new Error(
      `Create event draft failed with ${createDraftResponse.status()}: ${body}`,
    );
  }

  const createEventResponse = await createEventResponsePromise;

  const createEventResponseBody = await createEventResponse
    .text()
    .catch(() => '<unreadable>');
  expect(
    createEventResponse.ok(),
    `Create event failed with ${createEventResponse.status()}: ${createEventResponseBody}`
  ).toBeTruthy();

  const createEventResponseJson = JSON.parse(createEventResponseBody);
  const eventId = createEventResponseJson.Event?.Id;
  if (!eventId) {
    throw new Error(
      `Could not parse event ID from create-event response: ${createEventResponseBody}`
    );
  }

  // The frontend either navigates directly to the event or opens the optional
  // community-notification modal. Wait for whichever happens first.
  const notNowButton = page.getByRole('button', {
    name: 'Not now',
    exact: true,
  });
  const eventUrl = new RegExp(`/event/${eventId}(?:\\?|$)`);
  const postCreateOutcome = await Promise.any([
    page
      .waitForURL(eventUrl, { timeout: 10_000 })
      .then(() => 'navigated' as const),
    notNowButton
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => 'not-now' as const),
  ]).catch(() => 'pending' as const);

  if (postCreateOutcome === 'not-now') {
    await notNowButton.click();
  }

  // Do not navigate there on behalf of the application. The redirect is part
  // of the creation UX and must remain covered by this end-to-end helper.
  await expect(page).toHaveURL(eventUrl, { timeout: 30_000 });
  await expect(
    page.getByRole('heading', { name: eventName, exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText('General Admission Playwright', { exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });

  const url = page.url();
  console.log(`New event URL: ${url}`);
  return eventId;
}

export async function purchaseTicket(
  page: Page,
  eventId?: string
): Promise<string | undefined> {
  console.log('starting purchase ticket flow with eventId:', eventId);
  if (eventId) {
    //redirect to the event page using the eventId
    await page.goto(`${JASS_TEST_URL}/event/${eventId}`);
  } else {
    // No event ID passed: Create new event
    await createEvent(page);
  }

  // Best-effort capture of the organizer name from the event page so callers that
  // need it (e.g. operator-access checks) can reuse it. Returned optionally so the
  // many callers that ignore the return value are unaffected.
  let organizerName: string | undefined;
  try {
    const rawOrganizerName = await page
      .getByText(new RegExp(ORGANIZER_NAME_PREFIX))
      .first()
      .textContent({ timeout: 5000 });
    organizerName = rawOrganizerName?.trim() || undefined;
  } catch {
    // Organizer name not visible on this page; leave undefined.
  }

  // Select ticket and proceed
  // Select +1
  await page
    .getByRole('button', { name: /^Increase quantity for / })
    .first()
    .click();
  //Timeout
  await page.waitForTimeout(2000);
  await page.locator('[data-checkout-cta="true"]').first().click();

  // Fill buyer information
  await page
    .getByRole('textbox', { name: 'Enter first name' })
    .fill(CONTACT_NAME);
  await page.getByRole('textbox', { name: 'Enter last name' }).fill('Client');
  await page
    .getByRole('textbox', { name: 'Enter email address' })
    .fill(PLAYWRIGHT_BOT_EMAIL);
  await page.locator('#phone-input').nth(1).fill(CONTACT_PHONE_NUMBER);

  await page.getByRole('button', { name: 'Proceed to Payment' }).click();

  await expect(page.getByText('Payment Information')).toBeVisible({
    timeout: 15000,
  });

  // Fill Stripe card fields
  await fillIndividualStripeFields(page);

  await page.locator('#tosAccepted').check();

  // Integration success signal: checkout must redirect to the payment success page.
  const successUrlPromise = page.waitForURL(/\/payment\/success\//, {
    timeout: 45000,
  });
  await page.getByRole('button', { name: 'Checkout' }).click();
  await successUrlPromise;

  // Close the modal (if any):
  try {
    await page.getByRole('button', { name: 'Close' }).click({ timeout: 3000 });
  } catch {
    // Some browsers navigate directly to the success page without a modal.
  }
  await page.getByRole('img', { name: 'Ticket QR Code' }).click();

  return organizerName;
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

  await openEventPortalDestination(page1, 'ordersAndAttendees');
  await page1.getByRole('textbox', { name: 'Search Orders' }).click();

  await page1
    .getByRole('textbox', { name: 'Search Orders' })
    .fill(confirmation || '');

  await page1.getByRole('cell', { name: confirmation }).click();

  // New Refund Modal Flow
  await page1
    .getByRole('checkbox', { name: 'General Admission Playwright' })
    .check();

  const refundForm = page1
    .getByRole('textbox', { name: 'Refund Details' })
    .locator('xpath=ancestor::form');
  const displayedRefundAmount = refundForm
    .getByText(/^(?:[$€]|[A-Z]{3}\s*)[\d,]+\.\d{2}$/)
    .first();
  const readRefundAmount = async () => {
    const text = await displayedRefundAmount.textContent();
    const numericAmount = text?.match(/[\d,]+\.\d{2}$/)?.[0];
    return numericAmount ? Number(numericAmount.replaceAll(',', '')) : NaN;
  };

  // The event can use any supported currency, but its ticket face value is
  // deterministic and the refund preview must expose it to the organizer.
  await expect(displayedRefundAmount).toBeVisible();
  await expect.poll(readRefundAmount).toBeCloseTo(55, 2);
  const ticketAmount = await readRefundAmount();

  // Adding each fee component must update the visible refund preview. The
  // exact fee varies with the organizer country and event currency.
  await refundForm
    .getByRole('checkbox', { name: 'Include Service Fee' })
    .check();
  await expect.poll(readRefundAmount).toBeGreaterThan(ticketAmount);
  const amountWithServiceFee = await readRefundAmount();

  await refundForm
    .getByRole('checkbox', { name: 'Include Transaction Fee' })
    .check();
  await expect.poll(readRefundAmount).toBeGreaterThan(amountWithServiceFee);

  // Add description and submit refund
  await refundForm.getByRole('textbox', { name: 'Refund Details' }).click();
  await refundForm
    .getByRole('textbox', { name: 'Refund Details' })
    .fill('Playwright Refund');
  // Integration success signal: refund POST must complete successfully.
  const [refundResponse] = await Promise.all([
    page1.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/protected/refunds'),
      { timeout: 30000 }
    ),
    refundForm.getByRole('button', { name: 'Submit Refund' }).click(),
  ]);
  expect(refundResponse.ok()).toBeTruthy();

  // UI success signal: organizer sees refund confirmation after backend success.
  const successBanner = refundForm.getByText(
    'Refund submitted successfully.',
  );
  await expect(successBanner).toBeVisible({ timeout: 15000 });

  // Check that the selected ticket has no remaining refundable balance.
  await expect.poll(readRefundAmount).toBe(0);

  // Close the modal
  await page1.getByRole('button', { name: '✕' }).click();

  // Return success banner
  return { page1, successBanner };
}

export async function deleteEvent(page: Page) {
  // Do e2e flow up until now: create organizer, create event, purchase ticket, refund ticket
  const { page1 } = await refundTicket(page);

  await openEventPortalDestination(page1, 'eventSettings');

  const deleteEventButton = page1.getByRole('button', { name: 'Delete Event' });
  await expect(deleteEventButton).toBeVisible({ timeout: 30000 });
  await deleteEventButton.click();
  await page1.getByRole('button', { name: 'Delete', exact: true }).click();

  return { page1 };
}

export async function selectFirstEventStartingWithPBO(
  page: Page
): Promise<Page> {
  // Sign in first
  await signIn(page);

  // Go to events page
  await page.goto(`${JASS_TEST_URL}/events`);
  const searchEventsInput = page.getByRole('textbox', {
    name: 'Search events',
  });
  await expect(searchEventsInput).toBeVisible({ timeout: 30000 });
  await searchEventsInput.click();
  await searchEventsInput.fill(EVENT_NAME_PREFIX);

  // Prefer event names created by this suite.
  const preferredEventLink = page
    .getByRole('link', { name: new RegExp(`^${EVENT_NAME_PREFIX}`) })
    .first();
  let selectedEventLink = preferredEventLink;

  // Fallback to any PBO event if naming convention changed.
  if (
    !(await selectedEventLink.isVisible({ timeout: 10000 }).catch(() => false))
  ) {
    await searchEventsInput.fill(ORGANIZER_NAME_PREFIX.trim());
    selectedEventLink = page.getByRole('link', { name: /^PBO/i }).first();
  }

  if (
    !(await selectedEventLink.isVisible({ timeout: 10000 }).catch(() => false))
  ) {
    throw new Error(
      `No events found for "${EVENT_NAME_PREFIX}" (or fallback "PBO"). Please ensure test events are available.`
    );
  }

  // Click the first event found
  await selectedEventLink.click();

  // Wait for the event page to load and click "Organizer View"
  const organizerViewLink = page.getByText('Organizer View');
  await expect(organizerViewLink).toBeVisible({ timeout: 30000 });
  const page2Promise = page.waitForEvent('popup');
  await organizerViewLink.click();
  const page2 = await page2Promise;

  await expect(
    page2
      .getByRole('button', { name: 'Overview', exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible({ timeout: 30_000 });

  return page2;
}

export async function openEventOrganizerPortal(
  page: Page,
  eventId: string
): Promise<Page> {
  const eventResponse = await page.request.get(
    `${JASS_TEST_URL}/api/public/events/${eventId}`,
    { timeout: 30000 }
  );
  expect(eventResponse.ok()).toBeTruthy();

  const eventResponseJson = await eventResponse.json();
  const organizerId =
    eventResponseJson.Event?.OrganizerId ?? eventResponseJson.OrganizerId;

  if (!organizerId) {
    throw new Error(
      `Could not parse organizer ID from public event response for event ${eventId}`
    );
  }

  await page.goto(
    `${JASS_TEST_URL}/portal/organizer/company/${organizerId}/event/${eventId}`
  );
  await expect(
    page
      .getByRole('button', { name: 'Overview', exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible({ timeout: 30_000 });

  return page;
}

export async function createEventAndOpenOrganizerPortal(
  page: Page
): Promise<Page> {
  const eventId = await createEvent(page);
  return openEventOrganizerPortal(page, eventId);
}

export async function editEventBasics(organizerPage: Page) {
  await openEventPortalDestination(organizerPage, 'eventDetails');
  await reloadStaleEventDataIfPresent(organizerPage);

  const title = organizerPage
    .getByPlaceholder('Event title')
    .filter({ visible: true })
    .first();
  await expect(title).toBeVisible({ timeout: 30_000 });
  const timestamp = Date.now();
  const eventTitleWithTimestamp = `${EVENT_NEW_TITLE} ${timestamp}`;
  await title.fill(eventTitleWithTimestamp);

  const description = organizerPage.locator('#studio-description:visible');
  await description.fill(EVENT_NEW_DESCRIPTION);

  const saveResponsePromise = organizerPage.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      /\/api\/protected\/events\/[^/]+$/.test(new URL(response.url()).pathname),
    { timeout: 30_000 },
  );
  const saveButton = organizerPage
    .getByRole('button', { name: 'Save changes', exact: true })
    .filter({ visible: true });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  expect((await saveResponsePromise).ok()).toBeTruthy();

  // The current canvas clears its transient success banner as the refreshed
  // event arrives. Assert the durable, user-visible result instead.
  await expect(title).toHaveValue(eventTitleWithTimestamp);
  return title;
}

export async function editEventTimeAndLocation(organizerPage: Page) {
  await openEventPortalDestination(organizerPage, 'eventDetails');
  await reloadStaleEventDataIfPresent(organizerPage);

  const description = organizerPage.locator('#studio-description:visible');
  const dateRow = description.locator(
    'xpath=ancestor::div[button][1]/button[1]'
  );
  const locationRow = description.locator(
    'xpath=ancestor::div[button][1]/button[2]'
  );

  // Move the existing start one day forward through the new date/time sheet.
  await dateRow.click();
  let dateSheet = visibleStudioSheet(organizerPage, 'When is it?');
  await expect(dateSheet).toBeVisible();
  const dateInputs = dateSheet.locator('input[type="datetime-local"]');
  const currentStart = await dateInputs.nth(0).inputValue();
  const nextStartDate = new Date(currentStart);
  nextStartDate.setDate(nextStartDate.getDate() + 1);
  const pad = (value: number) => String(value).padStart(2, '0');
  const nextStart = `${nextStartDate.getFullYear()}-${pad(
    nextStartDate.getMonth() + 1
  )}-${pad(nextStartDate.getDate())}T${pad(nextStartDate.getHours())}:${pad(
    nextStartDate.getMinutes()
  )}`;
  await dateInputs.nth(0).fill(nextStart);
  await dateSheet
    .getByRole('button', { name: 'Done', exact: true })
    .click();

  // Update the venue through the new location sheet. Event creation already
  // covers selecting a Places suggestion; this edit path verifies that the
  // resolved location can be adjusted and persisted.
  await locationRow.click();
  const locationSheet = visibleStudioSheet(organizerPage, 'Where is it?');
  await expect(locationSheet).toBeVisible();
  const uniqueVenueName = `${EVENT_NEW_VENUE} ${Date.now()}`;
  await locationSheet.locator('#venue-name').fill(uniqueVenueName);
  await locationSheet
    .getByRole('button', { name: 'Done', exact: true })
    .click();

  const saveButton = organizerPage
    .getByRole('button', { name: 'Save changes', exact: true })
    .filter({ visible: true });
  await expect(saveButton).toBeEnabled({ timeout: 30_000 });
  const saveResponsePromise = organizerPage.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      /\/api\/protected\/events\/[^/]+$/.test(new URL(response.url()).pathname),
    { timeout: 30_000 },
  );
  const refreshResponsePromise = waitForEventDetailsRefresh(organizerPage);
  await saveButton.click();
  expect((await saveResponsePromise).ok()).toBeTruthy();
  expect((await refreshResponsePromise).ok()).toBeTruthy();
  await expect(locationRow).toContainText(uniqueVenueName);

  // Reopen the date sheet to assert the saved time through the user-facing UI.
  await dateRow.click();
  dateSheet = visibleStudioSheet(organizerPage, 'When is it?');
  await expect(dateSheet.locator('input[type="datetime-local"]').nth(0)).toHaveValue(
    nextStart
  );
  return locationRow;
}

export async function editEventAdditionalDetails(organizerPage: Page) {
  await openEventPortalDestination(organizerPage, 'eventDetails');
  await reloadStaleEventDataIfPresent(organizerPage);

  const checkoutAndEmails = organizerPage
    .getByRole('button')
    .filter({ hasText: /^Checkout & emails/ })
    .filter({ visible: true });
  await checkoutAndEmails.click();
  let checkoutSheet = visibleStudioSheet(organizerPage, 'Checkout & emails');
  await expect(checkoutSheet).toBeVisible();
  const uniqueAdditionalDetails = `${EVENT_NEW_ADDITIONAL_DETAILS} ${Date.now()}`;
  await checkoutSheet
    .locator('#edit-post-checkout')
    .fill(uniqueAdditionalDetails);
  await checkoutSheet
    .getByRole('button', { name: 'Done', exact: true })
    .click();

  const money = organizerPage
    .getByRole('button')
    .filter({ hasText: /^Money/ })
    .filter({ visible: true });
  await money.click();
  let moneySheet = visibleStudioSheet(organizerPage, 'Money');
  await expect(moneySheet).toBeVisible();
  await moneySheet.locator('#edit-tax-rate').fill(EVENT_NEW_TAX_RATE);
  await moneySheet
    .getByRole('button', { name: 'Done', exact: true })
    .click();

  const saveButton = organizerPage
    .getByRole('button', { name: 'Save changes', exact: true })
    .filter({ visible: true });
  await expect(saveButton).toBeEnabled({ timeout: 30_000 });
  const saveResponsePromise = organizerPage.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      /\/api\/protected\/events\/[^/]+$/.test(new URL(response.url()).pathname),
    { timeout: 30_000 },
  );
  const refreshResponsePromise = waitForEventDetailsRefresh(organizerPage);
  await saveButton.click();
  expect((await saveResponsePromise).ok()).toBeTruthy();
  expect((await refreshResponsePromise).ok()).toBeTruthy();

  // Reopen both sheets to verify the saved values through the redesigned UX.
  await checkoutAndEmails.click();
  checkoutSheet = visibleStudioSheet(organizerPage, 'Checkout & emails');
  await expect(checkoutSheet.locator('#edit-post-checkout')).toHaveValue(
    uniqueAdditionalDetails
  );
  await checkoutSheet
    .getByRole('button', { name: 'Done', exact: true })
    .click();
  await money.click();
  moneySheet = visibleStudioSheet(organizerPage, 'Money');
  const savedTaxRate = moneySheet.locator('#edit-tax-rate');
  await expect(savedTaxRate).toHaveValue(EVENT_NEW_TAX_RATE);
  return savedTaxRate;
}

export async function manageEventPromoCodes(organizerPage: Page) {
  // Generate unique promo code with timestamp
  const uniquePromoCode = generateUniquePromoCode();

  await openEventPortalDestination(organizerPage, 'promote');

  // Add new promo code
  await organizerPage
    .getByRole('button', { name: 'Manage Promo Codes' })
    .click();
  await createPromoCodeInManagementModalAndAddToEvent(
    organizerPage,
    uniquePromoCode
  );

  await attachPromoCodeToAllTicketTypes(organizerPage);

  await searchAndClickEventPromoCode(organizerPage, uniquePromoCode);
  await organizerPage.getByRole('button', { name: 'Show details' }).click();
  await organizerPage
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  await organizerPage.getByRole('spinbutton', { name: 'Usage Limit' }).click();
  await organizerPage
    .getByRole('spinbutton', { name: 'Usage Limit' })
    .fill('10');
  await organizerPage.getByRole('checkbox', { name: 'Active' }).uncheck();
  await organizerPage.getByRole('button', { name: 'Update' }).click();
  await organizerPage.getByRole('table').getByText('(0 / 10)').click();
  await organizerPage
    .getByRole('button', { name: 'Edit', exact: true })
    .first()
    .click();
  await organizerPage.getByRole('checkbox', { name: 'Active' }).check();
  await organizerPage.getByRole('button', { name: 'Update' }).click();

  // Timeout
  await organizerPage.waitForTimeout(3000);

  // Return confirmation message
  return organizerPage.getByText('No promo codes found for this');
}

export async function bookComplimentaryTicket(organizerPage: Page) {
  await openOrdersAndAttendees(organizerPage);

  // Book tickets from organizer portal
  await organizerPage
    .getByRole('button')
    .filter({ hasText: /^Book Tickets$/, visible: true })
    .click();
  const bookingModal = await selectOrganizerTicketAndContinue(organizerPage);

  await bookingModal
    .locator('label')
    .filter({ hasText: 'Complimentary' })
    .click();

  // Fill attendee information
  await bookingModal.locator('#FirstName').fill(ATTENDEE_FIRST_NAME);
  await bookingModal.locator('#LastName').fill(ATTENDEE_LAST_NAME);
  await bookingModal.locator('#Email').fill(ATTENDEE_EMAIL);
  await bookingModal.locator('#phone-input').fill(ATTENDEE_PHONE);

  // Accept terms

  const terms = bookingModal.locator('#tosAccepted');
  await expect(terms).toHaveCount(1);
  await terms.check();

  // Confirm booking
  const complimentaryResponsePromise = organizerPage.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/tickets/complimentary')
  );
  const successUrlPromise = organizerPage.waitForURL(
    /\/payment\/success\/event\//,
    { timeout: 45000 }
  );
  await bookingModal
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  const complimentaryResponse = await complimentaryResponsePromise;
  expect(complimentaryResponse.ok()).toBeTruthy();
  await successUrlPromise;

  // Return confirmation heading
  const confirmationHeading = organizerPage.getByRole('heading', {
    name: 'Order Confirmed!',
  });
  await expect(confirmationHeading).toBeVisible({ timeout: 15000 });
  return confirmationHeading;
}

/**
 * Guarantees the event has at least one attendee before a "message all
 * attendees" flow. Messaging resolves recipients from the attendee list, so an
 * event with zero attendees yields "No valid email addresses found". When the
 * event is empty we book a complimentary ticket (free, no Stripe onboarding
 * needed) to create a recipient, then return to the organizer portal.
 */
export async function ensureEventHasAttendee(
  organizerPage: Page
): Promise<void> {
  const portalUrl = organizerPage.url();
  const eventId = portalUrl.match(/event\/([^/?#]+)/)?.[1];

  let hasAttendee = false;
  if (eventId) {
    try {
      const response = await organizerPage.request.get(
        `${JASS_TEST_URL}/api/protected/events/${eventId}/tickets`
      );
      if (response.ok()) {
        const tickets = await response.json();
        hasAttendee = Array.isArray(tickets) && tickets.length > 0;
      }
    } catch {
      // Fall through and book a ticket — booking is safe even if the check failed.
      hasAttendee = false;
    }
  }

  if (hasAttendee) return;

  console.log(
    '[INFO] Event has no attendees; booking a complimentary ticket to ensure a recipient exists.'
  );
  await bookComplimentaryTicket(organizerPage);

  // bookComplimentaryTicket ends on the payment-success page; return to the
  // organizer portal so the messaging flow can continue.
  await organizerPage.goto(portalUrl);
  await expect(
    organizerPage
      .getByRole('button', { name: 'Overview', exact: true })
      .filter({ visible: true })
      .first()
  ).toBeVisible({ timeout: 30000 });
}

export async function sendMessageToAttendees(
  organizerPage: Page,
  subject = MESSAGE_SUBJECT,
  body = MESSAGE_BODY
) {
  // A "message all attendees" send needs at least one recipient.
  await ensureEventHasAttendee(organizerPage);

  await openOrdersAndAttendees(organizerPage);
  const messageModal = await openMessageAttendees(organizerPage);

  await messageModal
    .getByRole('textbox', { name: 'Enter the subject...' })
    .fill(subject);

  // Click next
  await messageModal
    .getByRole('button', { name: 'Next', exact: true })
    .click();

  // Fill message body
  const messageBody = messageModal.locator('#message-body-inline');
  await expect(messageBody).toHaveCount(1);
  await messageBody.fill(body);

  // Send message
  const sendButton = messageModal.getByRole('button', {
    name: 'Send',
    exact: true,
  });
  const sendMessageResponsePromise = organizerPage.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/protected/organizers/') &&
      response.url().includes('/email/send'),
    { timeout: 30_000 }
  );
  await sendButton.click();
  expect((await sendMessageResponsePromise).ok()).toBeTruthy();

  // Success state: modal closes after the message is sent
  await expect(sendButton).toBeHidden();

  // Return modal send button locator for assertion at call sites
  return sendButton;
}

export async function manageEventAttendeesAndCommunications(
  organizerPage: Page
) {
  // Generate a random 4-character string to append to the subject
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const uniqueSubject = `${MESSAGE_SUBJECT} ${randomSuffix}`;

  // First, book a complimentary ticket to ensure we have attendees
  await openOrdersAndAttendees(organizerPage);

  // Book tickets from organizer portal
  await organizerPage
    .getByRole('button')
    .filter({ hasText: /^Book Tickets$/, visible: true })
    .click();
  const bookingModal = await selectOrganizerTicketAndContinue(organizerPage);

  await bookingModal
    .locator('label')
    .filter({ hasText: 'Complimentary' })
    .click();

  // Save current URL to return to Orders & Attendees later
  const currentURL = organizerPage.url();

  // Fill attendee information
  await bookingModal.locator('#FirstName').fill(ATTENDEE_FIRST_NAME);
  await bookingModal.locator('#LastName').fill(ATTENDEE_LAST_NAME);
  await bookingModal.locator('#Email').fill(ATTENDEE_EMAIL);
  await bookingModal.locator('#phone-input').fill(ATTENDEE_PHONE);

  // Accept terms
  try {
    const whoIsGoingCheckbox = bookingModal.getByRole('checkbox', {
      name: 'I agree to appear in the',
    });
    if ((await whoIsGoingCheckbox.count()) > 0) {
      await whoIsGoingCheckbox.check();
    } else {
      console.log('Who Is Going is disabled. Continuing...');
    }
  } catch {
    console.log('Who Is Going is disabled. Continuing...');
  }

  const terms = bookingModal.locator('#tosAccepted');
  await expect(terms).toHaveCount(1);
  await terms.check();

  // Confirm booking
  const complimentaryResponsePromise = organizerPage.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/tickets/complimentary'),
    { timeout: 45_000 }
  );
  const successUrlPromise = organizerPage.waitForURL(
    /\/payment\/success\/event\//,
    { timeout: 45_000 }
  );
  await bookingModal
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  const complimentaryResponse = await complimentaryResponsePromise;
  const complimentaryResponseBody = await complimentaryResponse
    .text()
    .catch(() => '<unreadable>');
  expect(
    complimentaryResponse.ok(),
    `Complimentary booking failed with ${complimentaryResponse.status()}: ${complimentaryResponseBody}`
  ).toBeTruthy();
  await successUrlPromise;

  // Verify booking confirmation
  const confirmationHeading = organizerPage.getByRole('heading', {
    name: 'Order Confirmed!',
  });
  await confirmationHeading.waitFor();

  // Navigate back to Orders & Attendees to send message
  await organizerPage.goto(currentURL);
  await openOrdersAndAttendees(organizerPage);

  // Send message to attendees
  const messageModal = await openMessageAttendees(organizerPage);
  await messageModal
    .getByRole('textbox', { name: 'Enter the subject...' })
    .fill(uniqueSubject);

  // Click next
  await messageModal
    .getByRole('button', { name: 'Next', exact: true })
    .click();

  // Fill message body
  const messageBody = messageModal.locator('#message-body-inline');
  await expect(messageBody).toHaveCount(1);
  await messageBody.fill(MESSAGE_BODY);

  // Send message
  const sendButton = messageModal.getByRole('button', {
    name: 'Send',
    exact: true,
  });
  const sendMessageResponsePromise = organizerPage.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/protected/organizers/') &&
      response.url().includes('/email/send'),
    { timeout: 30_000 }
  );
  await sendButton.click();
  const sendMessageResponse = await sendMessageResponsePromise;
  expect(sendMessageResponse.ok()).toBeTruthy();

  // Success state: modal closes after the message is sent
  await expect(sendButton).toBeHidden();

  // Navigate to Communications to verify the message appears.
  await openEventPortalDestination(organizerPage, 'communications');

  const communicationsSearch =
    organizerPage.getByPlaceholder('Search emails...');
  await expect(communicationsSearch).toBeVisible({ timeout: 30_000 });
  const filteredEmailsResponsePromise = organizerPage.waitForResponse(
    (response) => {
      if (
        response.request().method() !== 'GET' ||
        !response.url().includes('/custom-emails')
      ) {
        return false;
      }

      const url = new URL(response.url());
      return url.searchParams.get('search') === uniqueSubject;
    },
    { timeout: 30_000 }
  );
  await communicationsSearch.fill(uniqueSubject);
  const filteredEmailsResponse = await filteredEmailsResponsePromise;
  expect(filteredEmailsResponse.ok()).toBeTruthy();

  // Verify the sent message appears in the communications cards.
  const messageHeading = organizerPage.getByRole('heading', {
    name: uniqueSubject,
    exact: true,
  });

  return { confirmationHeading, sendButton, messageHeading };
}

// Helper function for event duplication logic
async function performEventDuplication(
  organizerPage: Page,
  originalEventTitle: string
) {
  // Generate timestamp for unique naming
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const duplicatedEventTitle = `${originalEventTitle} (Duplicated at ${timestamp})`;

  await openEventPortalDestination(organizerPage, 'eventSettings');

  // Start duplication process
  await organizerPage.getByRole('button', { name: 'Duplicate Event' }).click();

  // Find the event name field in the duplicate modal and update it
  // The field should contain the current event title by default
  const eventNameField = organizerPage
    .getByRole('textbox')
    .filter({ visible: true })
    .first();
  await eventNameField.click();
  await eventNameField.clear(); // Clear existing text
  await eventNameField.fill(duplicatedEventTitle);

  const dateInputs = organizerPage.locator('input[type="datetime-local"]:visible');
  await expect(dateInputs).toHaveCount(2);
  await dateInputs.nth(0).fill('2040-08-20T10:00');

  // Complete the duplication
  const duplicateResponsePromise = organizerPage.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/duplicate'),
    { timeout: 30_000 }
  );
  await organizerPage
    .getByRole('button', { name: 'Duplicate', exact: true })
    .click();
  const duplicateResponse = await duplicateResponsePromise;
  expect(duplicateResponse.ok()).toBeTruthy();

  // Duplication returns to the redesigned organizer portal. Open the Events
  // surface explicitly, then find the duplicated event through the UI.
  await expect(organizerPage).toHaveURL(/\/portal\/organizer\/company\//, {
    timeout: 30_000,
  });
  await openOrganizerSurface(organizerPage, 'events');

  const eventSearch = organizerPage.getByPlaceholder(/Search Events/i);
  await expect(eventSearch).toBeVisible({ timeout: 30_000 });

  // Search for the new duplicated event title
  await eventSearch.fill(duplicatedEventTitle);
  const duplicatedEventHeading = organizerPage.getByRole('heading', {
    name: duplicatedEventTitle,
    exact: true,
  });
  await expect(duplicatedEventHeading).toBeVisible({ timeout: 30_000 });
  await duplicatedEventHeading.click();

  // If the event is draft, publish it
  const publishButton = organizerPage
    .getByRole('button', { name: 'Publish', exact: true })
    .filter({ visible: true });
  if (await publishButton.isVisible().catch(() => false)) {
    const publishResponsePromise = organizerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/publish'),
      { timeout: 30_000 }
    );
    await publishButton.click();
    const publishResponse = await publishResponsePromise;
    expect(publishResponse.ok()).toBeTruthy();
  }

  await expect(
    organizerPage
      .getByRole('button', { name: 'Overview', exact: true })
      .filter({ visible: true })
      .first()
  ).toBeVisible({ timeout: 30_000 });

  return duplicatedEventTitle;
}

export async function duplicateEvent(organizerPage: Page) {
  // First, get the current event title
  await openEventPortalDestination(organizerPage, 'eventDetails');
  const eventTitleInput = organizerPage.getByPlaceholder('Event title');
  await expect(eventTitleInput).toBeVisible({ timeout: 30_000 });
  const eventTitle = await eventTitleInput.inputValue();

  // Perform the duplication using shared logic
  await performEventDuplication(organizerPage, eventTitle);

  // Return a locator to verify we're on the duplicated event page
  return organizerPage
    .getByRole('button', { name: 'Overview', exact: true })
    .filter({ visible: true })
    .first();
}

export async function duplicateEventWithPromoCodes(organizerPage: Page) {
  // Generate unique promo code with timestamp
  const uniquePromoCode = generateUniquePromoCode();

  // First, get the current event title
  await openEventPortalDestination(organizerPage, 'eventDetails');
  const eventTitleInput = organizerPage.getByPlaceholder('Event title');
  await expect(eventTitleInput).toBeVisible({ timeout: 30_000 });
  const eventTitle = await eventTitleInput.inputValue();

  // Go to Promote tab and add promo codes to the original event
  await openEventPortalDestination(organizerPage, 'promote');

  // Add new promo code
  await organizerPage
    .getByRole('button', { name: 'Manage Promo Codes' })
    .click();
  await createPromoCodeInManagementModalAndAddToEvent(
    organizerPage,
    uniquePromoCode
  );

  await attachPromoCodeToAllTicketTypes(organizerPage);

  // Now duplicate the event using shared logic
  await performEventDuplication(organizerPage, eventTitle);

  // Try to apply promo code in the event and see the discounted price

  // Go to Promote tab to verify promo codes were duplicated
  await openEventPortalDestination(organizerPage, 'promote');

  // Dynamically find and click the unique promo code that was created
  const promoCodeFound = await findAndClickPromoCode(
    organizerPage,
    uniquePromoCode
  );

  if (!promoCodeFound) {
    throw new Error(
      `Could not find the created promo code "${uniquePromoCode}" in the duplicated event`
    );
  }

  // Return the duplicated promo code itself as the final user-visible assertion.
  return organizerPage.getByRole('cell', {
    name: uniquePromoCode,
    exact: true,
  });
}

export async function resendConfirmationEmail(organizerPage: Page) {
  await openOrdersAndAttendees(organizerPage);

  // Find and click on the order created by this test.
  const attendeeName = `${ATTENDEE_FIRST_NAME} ${ATTENDEE_LAST_NAME}`;
  const orderTable = organizerPage.getByRole('table');
  const orderRow = orderTable
    .getByRole('row')
    .filter({ hasText: ATTENDEE_EMAIL })
    .or(orderTable.getByRole('row').filter({ hasText: attendeeName }))
    .first();
  await expect(orderRow).toBeVisible({ timeout: 30000 });
  await orderRow.click();

  const sendConfirmationButton = organizerPage.getByRole('button', {
    name: 'Send Confirmation Email',
  });
  await expect(sendConfirmationButton).toBeVisible({ timeout: 30000 });
  await sendConfirmationButton.click();

  await expect(organizerPage.getByText('Email sent successfully!')).toBeVisible(
    { timeout: 30000 }
  );
  return sendConfirmationButton;
}

export async function verifyOperatorAccess(
  page: Page,
  organizerName: string,
  eventName?: string
) {
  // The old organizer-search screen was replaced by the sidebar switcher. An
  // operator can belong to several organizations, and sign-in restores the
  // last one used, so select the organization this test just authorized.
  if (new URL(page.url()).pathname === '/portal/home') {
    const organizerButton = page
      .getByRole('button', { name: organizerName, exact: true })
      .filter({ visible: true })
      .first();
    await expect(organizerButton).toBeVisible({ timeout: 30_000 });
    await organizerButton.click();
  }

  await expect(page).toHaveURL(/\/portal\/organizer\/company\//, {
    timeout: 30_000,
  });
  const organizerSwitcher = page
    .locator('[data-organizer-switcher-trigger]:visible')
    .first();
  await expect(organizerSwitcher).toBeVisible({ timeout: 30_000 });
  const selectedOrganizerName = organizerSwitcher.getByText(organizerName, {
    exact: true,
  });
  if (!(await selectedOrganizerName.isVisible().catch(() => false))) {
    await organizerSwitcher.click();
    const organizerSearch = page
      .getByPlaceholder('Search organizations')
      .filter({ visible: true });
    if (await organizerSearch.isVisible().catch(() => false)) {
      await organizerSearch.fill(organizerName);
    }
    const organizerOption = page
      .getByRole('button')
      .filter({
        has: page.getByText(organizerName, { exact: true }),
      })
      .filter({ visible: true })
      .first();
    await expect(organizerOption).toBeVisible({ timeout: 30_000 });
    await organizerOption.click();
    await expect(organizerSwitcher.getByText(organizerName, { exact: true }))
      .toBeVisible({ timeout: 30_000 });
  }

  if (!new URL(page.url()).pathname.includes('/event/')) {
    const eventSearch = page.getByPlaceholder(/Search Events/i);
    await expect(eventSearch).toBeVisible({ timeout: 30_000 });
    if (eventName) await eventSearch.fill(eventName);

    const eventHeading = page.getByRole('heading', {
      name: eventName,
      exact: true,
    });
    await expect(eventHeading).toBeVisible({ timeout: 30_000 });
    await eventHeading.click();
  }

  // Read Event grants access to the event overview.
  await expect(
    page
      .getByRole('button', { name: 'Overview', exact: true })
      .filter({ visible: true })
      .first()
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Access Restricted')).toHaveCount(0);

  // Verify order management
  await openEventPortalDestination(page, 'ordersAndAttendees');
  const orderCell = page
    .getByRole('cell')
    .filter({ hasText: /#[A-Z0-9]+/ })
    .first();
  if ((await orderCell.count()) > 0) {
    await orderCell.click();
    const confirmationEmailResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname ===
          '/api/protected/transactions/confirmation/email',
      { timeout: 30_000 }
    );
    await page
      .getByRole('button', { name: 'Send Confirmation Email' })
      .click();
    const confirmationEmailResponse = await confirmationEmailResponsePromise;
    const confirmationEmailResponseBody = await confirmationEmailResponse
      .text()
      .catch(() => '<unreadable>');
    expect(
      confirmationEmailResponse.ok(),
      `Resend confirmation email failed with ${confirmationEmailResponse.status()}: ${confirmationEmailResponseBody}`
    ).toBeTruthy();
    await expect(page.getByText('Email sent successfully!')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: '✕' }).click();
  }

  // Close the modal.

  //timeout
  await page.waitForTimeout(2000);

  // Check attendees tab
  await page.getByRole('button', { name: 'Attendees', exact: true }).click();
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: /General Admission|Active|Not Scanned/ })
  ).toBeVisible({ timeout: 10000 });

  // Verify ticket type management
  await openEventPortalDestination(page, 'ticketTypes');
  await expect(
    page.getByText('General Admission Playwright', { exact: true }).first()
  ).toBeVisible({ timeout: 30_000 });

  // Test creating a new ticket type
  await page.getByRole('button', { name: 'Add Ticket Type' }).click();
  const timestamp = Date.now();
  const ticketTypeName = `Operator Test ${timestamp.toString().slice(-4)}`;
  await expect(
    page.getByRole('heading', { name: 'New ticket type', exact: true })
  ).toBeVisible({ timeout: 30_000 });
  await page.locator('#ticket-name:visible').fill(ticketTypeName);
  await page.locator('#ticket-quantity:visible').fill('5');
  await page.locator('#ticket-price:visible').fill('25.00');
  const createTicketTypeResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/ticket-types'),
    { timeout: 30_000 }
  );
  await page
    .getByRole('button', { name: 'Add ticket type', exact: true })
    .click();
  const createTicketTypeResponse = await createTicketTypeResponsePromise;
  expect(createTicketTypeResponse.ok()).toBeTruthy();
  await expect(
    page.getByText(ticketTypeName, { exact: true }).first()
  ).toBeVisible({ timeout: 30_000 });

  // Verify event editing
  await openEventPortalDestination(page, 'eventDetails');
  const eventTitleInput = page.getByPlaceholder('Event title');
  await expect(eventTitleInput).toBeVisible({ timeout: 30_000 });
  const originalTitle = await eventTitleInput.inputValue();
  const newTitle = `${originalTitle} (Operator Edit)`;
  await eventTitleInput.fill(newTitle);
  const updateEventResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      /\/api\/protected\/events\/[^/]+\/?$/.test(
        new URL(response.url()).pathname
      ),
    { timeout: 30_000 }
  );
  const refreshedEventResponsePromise = waitForEventDetailsRefresh(page);
  await page
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  const updateEventResponse = await updateEventResponsePromise;
  expect(updateEventResponse.ok()).toBeTruthy();
  expect((await refreshedEventResponsePromise).ok()).toBeTruthy();
  await expect(eventTitleInput).toHaveValue(newTitle);

  // Verify refunds and settings access
  await openEventPortalDestination(page, 'refunds');
  await expect(
    page
      .getByRole('button', { name: 'Refresh', exact: true })
      .filter({ visible: true })
      .first()
  ).toBeVisible({ timeout: 30_000 });
  await openEventPortalDestination(page, 'eventSettings');
  await expect(
    page.getByText('Event Settings', { exact: true }).filter({ visible: true })
      .first()
  ).toBeVisible({ timeout: 30_000 });
  // Duplicating creates a new organizer-level event. The redesigned settings
  // UI intentionally withholds that action from event-scoped operators.
  await expect(
    page.getByRole('button', { name: 'Duplicate Event', exact: true })
  ).toHaveCount(0);
}
