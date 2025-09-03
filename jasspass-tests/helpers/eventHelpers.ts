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

// Helper function to generate unique promo code with timestamp
function generateUniquePromoCode(): string {
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
  return `${EVENT_PLAYWRIGHT_PROMO_CODE}${timestamp}`;
}

// Helper function to find and click a specific promo code with pagination support
async function findAndClickPromoCode(
  organizerPage: Page,
  promoCode: string
): Promise<boolean> {
  let found = false;
  let currentPage = 1;
  const maxPages = 10; // Safety limit to prevent infinite loops

  while (!found && currentPage <= maxPages) {
    // Look for the promo code on the current page
    const promoCodeHeading = organizerPage.getByRole('heading', {
      name: promoCode,
    });
    const promoCodeCount = await promoCodeHeading.count();

    if (promoCodeCount > 0) {
      // Found the promo code, click it
      await promoCodeHeading.click();
      found = true;
      console.log(
        `Found and clicked promo code "${promoCode}" on page ${currentPage}`
      );
      break;
    }

    // Check if there's a "Next" button to go to the next page
    const nextButton = organizerPage
      .getByRole('button', { name: 'Next' })
      .first();
    const nextButtonCount = await nextButton.count();

    if (nextButtonCount > 0) {
      // Check if the next button is enabled/clickable
      const isDisabled = await nextButton.isDisabled();
      if (!isDisabled) {
        await nextButton.click();
        await organizerPage.waitForTimeout(1000); // Wait for page to load
        currentPage++;
        console.log(
          `Navigated to page ${currentPage} looking for promo code "${promoCode}"`
        );
      } else {
        // Next button is disabled, we've reached the last page
        console.log(
          `Reached last page (${currentPage}) without finding promo code "${promoCode}"`
        );
        break;
      }
    } else {
      // No next button found, this might be the only page or last page
      console.log(
        `No pagination found, promo code "${promoCode}" not found on current page`
      );
      break;
    }
  }

  if (!found) {
    console.warn(
      `Promo code "${promoCode}" not found after searching ${currentPage} pages`
    );
  }

  return found;
}

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

export async function selectFirstEventStartingWithPBO(
  page: Page
): Promise<Page> {
  // Sign in first
  await signIn(page);

  // Wait for 5 seconds for sign in to load
  await page.waitForTimeout(5000);

  // Go to events page
  await page.goto(`${JASS_TEST_URL}/events`);
  await page.getByRole('textbox', { name: 'Search events' }).click();
  await page.getByRole('textbox', { name: 'Search events' }).fill('PBO');

  // Wait for search results to load
  await page.waitForTimeout(1000);

  // Find the first event link that starts with "PBO - Event" using a more specific name pattern
  // This will match any link that starts with "PBO - Event" followed by anything
  const eventLink = page.getByRole('link', { name: /^PBO - Event/ }).first();

  // Check if any event was found
  const eventCount = await eventLink.count();
  if (eventCount === 0) {
    throw new Error(
      `No events found starting with "PBO - Event". Please ensure test events are available.`
    );
  }

  // Click the first event found
  await eventLink.click();

  // Wait for the event page to load properly
  await page.waitForTimeout(2000);

  // Wait for the event page to load and click "Organizer View"
  const page2Promise = page.waitForEvent('popup');
  await page.getByText('Organizer View').click();
  const page2 = await page2Promise;

  // Wait for the organizer portal to load
  await page2.waitForTimeout(1000);

  return page2;
}

export async function editEventBasics(organizerPage: Page) {
  // Go to Edit Event
  await organizerPage.getByRole('link', { name: 'Edit Event' }).click();

  // Update event title with timestamp for uniqueness
  await organizerPage.getByRole('textbox', { name: 'Event Title' }).click();
  const timestamp = Date.now();
  const eventTitleWithTimestamp = `${EVENT_NEW_TITLE} ${timestamp}`;
  await organizerPage
    .getByRole('textbox', { name: 'Event Title' })
    .fill(eventTitleWithTimestamp);

  // Update long description
  await organizerPage
    .locator('#long-description_ifr')
    .contentFrame()
    .getByText('Join us for the Toronto')
    .click();
  await organizerPage
    .locator('#long-description_ifr')
    .contentFrame()
    .getByLabel('Rich Text Area')
    .fill(EVENT_NEW_DESCRIPTION);

  // Save changes
  await organizerPage.getByRole('button', { name: 'Save Changes' }).click();

  // Return success message locator
  return organizerPage.getByText('Event updated successfully');
}

export async function editEventTimeAndLocation(organizerPage: Page) {
  // Go to Edit Event
  await organizerPage.getByRole('link', { name: 'Edit Event' }).click();
  // Go to Time & Location
  await organizerPage.getByRole('link', { name: 'Time & Location' }).click();

  // Update address
  await organizerPage.getByRole('textbox', { name: 'Event Address' }).click();
  await organizerPage
    .getByRole('textbox', { name: 'Event Address' })
    .fill(EVENT_NEW_ADDRESS);

  // Update city
  await organizerPage.getByRole('textbox', { name: 'City' }).click();
  await organizerPage
    .getByRole('textbox', { name: 'City' })
    .fill(EVENT_NEW_CITY);

  // Update venue name
  await organizerPage.getByRole('textbox', { name: 'Venue Name' }).click();
  await organizerPage
    .getByRole('textbox', { name: 'Venue Name' })
    .fill(EVENT_NEW_VENUE);

  //Update postal code
  await organizerPage.getByRole('textbox', { name: 'Zip Code' }).click();
  await organizerPage.getByRole('textbox', { name: 'Zip Code' }).fill('M5A0M7');
  await organizerPage.getByRole('button', { name: 'Save Changes' }).click();

  // Save changes
  await organizerPage.getByRole('button', { name: 'Save Changes' }).click();

  // Return success message locator
  return organizerPage.getByText('Event updated successfully');
}

export async function editEventAdditionalDetails(organizerPage: Page) {
  // Go to Edit Event
  await organizerPage.getByRole('link', { name: 'Edit Event' }).click();

  // Go to Additional Details
  await organizerPage.getByRole('link', { name: 'Additional Details' }).click();

  // Update additional details text
  await organizerPage
    .locator('iframe[title="Rich Text Area"]')
    .contentFrame()
    .getByText('Thanks. See you soon!')
    .click();
  await organizerPage
    .locator('iframe[title="Rich Text Area"]')
    .contentFrame()
    .getByLabel('Rich Text Area')
    .fill(EVENT_NEW_ADDITIONAL_DETAILS);

  // Update tax rate
  await organizerPage
    .getByRole('textbox', { name: 'Enter tax rate percentage' })
    .click();
  await organizerPage
    .getByRole('textbox', { name: 'Enter tax rate percentage' })
    .fill(EVENT_NEW_TAX_RATE);

  // Check organizer absorbs fees checkboxes
  await organizerPage
    .getByRole('checkbox', { name: 'Organizer absorbs service fees' })
    .check();
  await organizerPage
    .getByRole('checkbox', { name: 'Organizer absorbs transaction' })
    .check();

  // Save changes
  await organizerPage.getByRole('button', { name: 'Save Changes' }).click();

  // Return success message locator
  return organizerPage.getByText('Event updated successfully');
}

export async function manageEventPromoCodes(organizerPage: Page) {
  // Generate unique promo code with timestamp
  const uniquePromoCode = generateUniquePromoCode();

  // Go to Promote tab
  await organizerPage.getByRole('link', { name: 'Promote' }).click();

  // Add new promo code
  await organizerPage.getByRole('button', { name: 'Add Promo Code' }).click();
  await organizerPage
    .getByRole('textbox', { name: 'Enter promo code' })
    .click();
  await organizerPage
    .getByRole('textbox', { name: 'Enter promo code' })
    .fill(uniquePromoCode);
  await organizerPage.getByPlaceholder('Enter discount percentage').click();
  await organizerPage
    .getByPlaceholder('Enter discount percentage')
    .fill(EVENT_PROMO_DISCOUNT);
  await organizerPage
    .locator('form')
    .getByRole('button', { name: 'Add Promo Code' })
    .click();

  // Add to event - use search approach to find the specific promo code
  await organizerPage
    .getByRole('textbox', { name: 'Search your organizer promo codes...' })
    .click();
  await organizerPage
    .getByRole('textbox', { name: 'Search your organizer promo codes...' })
    .fill(uniquePromoCode);
  await organizerPage.getByText(uniquePromoCode).click();
  await organizerPage.getByRole('button', { name: 'Add to Event' }).click();
  await organizerPage.getByLabel('Select a Ticket Type').selectOption('all');
  await organizerPage.getByRole('button', { name: 'Attach' }).click();

  // Now, find the promo code using the findPromoCode helper
  const promoCodeFound = await findAndClickPromoCode(
    organizerPage,
    uniquePromoCode
  );
  if (!promoCodeFound) {
    throw new Error(
      `Could not find the created promo code "${uniquePromoCode}"`
    );
  }

  // Modify promo code settings
  await organizerPage
    .locator('div')
    .filter({ hasText: /^0 \/ UnlimitedActive$/ })
    .getByRole('button')
    .click();
  await organizerPage
    .locator('div')
    .filter({ hasText: /^0 \/Unlimited$/ })
    .getByRole('checkbox')
    .uncheck();

  // Press tab
  await organizerPage
    .locator('div')
    .filter({ hasText: /^0 \/Unlimited$/ })
    .getByRole('checkbox')
    .press('Tab');

  await organizerPage.getByRole('spinbutton').fill(EVENT_PROMO_LIMIT);
  await organizerPage
    .locator('div')
    .filter({ hasText: /^Active$/ })
    .getByRole('checkbox')
    .uncheck();
  await organizerPage.getByRole('button', { name: 'Update' }).click();

  // Detach promo code
  await organizerPage.getByRole('button', { name: 'Detach' }).click();

  // Delete promo code
  await organizerPage
    .locator('div')
    .filter({ hasText: /^Add to Event$/ })
    .getByRole('img')
    .nth(1)
    .click();

  // Return confirmation message
  return organizerPage.getByText('No promo codes found for this');
}

export async function bookComplimentaryTicket(organizerPage: Page) {
  // Go to Orders & Attendees
  await organizerPage.getByRole('link', { name: 'Orders & Attendees' }).click();

  // Book tickets from organizer portal
  await organizerPage.getByRole('button', { name: 'Book Tickets' }).click();
  await organizerPage.getByRole('combobox').selectOption('1');
  await organizerPage.getByRole('button', { name: 'Get Tickets' }).click();
  await organizerPage
    .locator('label')
    .filter({ hasText: 'Complimentary' })
    .click();

  // Fill attendee information
  await organizerPage.getByRole('textbox', { name: 'First Name *' }).click();
  await organizerPage
    .getByRole('textbox', { name: 'First Name *' })
    .fill(ATTENDEE_FIRST_NAME);
  await organizerPage
    .getByRole('textbox', { name: 'First Name *' })
    .press('Tab');
  await organizerPage
    .getByRole('textbox', { name: 'Last Name *' })
    .fill(ATTENDEE_LAST_NAME);
  await organizerPage
    .getByRole('textbox', { name: 'Last Name *' })
    .press('Tab');
  await organizerPage
    .getByRole('textbox', { name: 'Email Address *' })
    .fill(ATTENDEE_EMAIL);
  await organizerPage.locator('#phone-input').click();
  await organizerPage.locator('#phone-input').fill(ATTENDEE_PHONE);

  // Accept terms
  await organizerPage
    .getByRole('checkbox', { name: 'I agree to appear in the' })
    .check();
  await organizerPage
    .locator('div')
    .filter({ hasText: /^I have read and agree to the Terms and Conditions$/ })
    .locator('#tosAccepted')
    .check();

  // Confirm booking
  await organizerPage.getByRole('button', { name: 'Confirm' }).click();

  // Return confirmation heading
  return organizerPage.getByRole('heading', { name: 'Order Confirmed!' });
}

export async function sendMessageToAttendees(organizerPage: Page) {
  // Go to Orders & Attendees
  await organizerPage.getByRole('link', { name: 'Orders & Attendees' }).click();

  // Open message modal
  await organizerPage
    .getByRole('button', { name: 'Message Attendees' })
    .click();
  await organizerPage
    .getByRole('textbox', { name: 'Enter the subject...' })
    .click();
  await organizerPage
    .getByRole('textbox', { name: 'Enter the subject...' })
    .fill(MESSAGE_SUBJECT);

  // Fill message body
  await organizerPage
    .locator('iframe[title="Rich Text Area"]')
    .contentFrame()
    .getByRole('paragraph')
    .click();
  await organizerPage
    .locator('iframe[title="Rich Text Area"]')
    .contentFrame()
    .getByLabel('Rich Text Area')
    .fill(MESSAGE_BODY);

  // Send message
  await organizerPage.getByRole('button', { name: 'Send' }).click();

  // Return success message
  return organizerPage.getByText('Message sent successfully!');
}

export async function manageEventAttendeesAndCommunications(
  organizerPage: Page
) {
  // Generate a random 4-character string to append to the subject
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const uniqueSubject = `${MESSAGE_SUBJECT} ${randomSuffix}`;

  // First, book a complimentary ticket to ensure we have attendees
  await organizerPage.getByRole('link', { name: 'Orders & Attendees' }).click();

  // Book tickets from organizer portal
  await organizerPage.getByRole('button', { name: 'Book Tickets' }).click();
  await organizerPage.getByRole('combobox').selectOption('1');
  await organizerPage.getByRole('button', { name: 'Get Tickets' }).click();
  await organizerPage
    .locator('label')
    .filter({ hasText: 'Complimentary' })
    .click();

  // Save current URL to return to Orders & Attendees later
  const currentURL = organizerPage.url();

  // Fill attendee information
  await organizerPage.getByRole('textbox', { name: 'First Name *' }).click();
  await organizerPage
    .getByRole('textbox', { name: 'First Name *' })
    .fill(ATTENDEE_FIRST_NAME);
  await organizerPage
    .getByRole('textbox', { name: 'First Name *' })
    .press('Tab');
  await organizerPage
    .getByRole('textbox', { name: 'Last Name *' })
    .fill(ATTENDEE_LAST_NAME);
  await organizerPage
    .getByRole('textbox', { name: 'Last Name *' })
    .press('Tab');
  await organizerPage
    .getByRole('textbox', { name: 'Email Address *' })
    .fill(ATTENDEE_EMAIL);
  await organizerPage.locator('#phone-input').click();
  await organizerPage.locator('#phone-input').fill(ATTENDEE_PHONE);

  // Accept terms
  await organizerPage
    .getByRole('checkbox', { name: 'I agree to appear in the' })
    .check();
  await organizerPage
    .locator('div')
    .filter({ hasText: /^I have read and agree to the Terms and Conditions$/ })
    .locator('#tosAccepted')
    .check();

  // Confirm booking
  await organizerPage.getByRole('button', { name: 'Confirm' }).click();

  // wait 3 seconds
  await organizerPage.waitForTimeout(3000);

  // Verify booking confirmation
  const confirmationHeading = organizerPage.getByRole('heading', {
    name: 'Order Confirmed!',
  });
  await confirmationHeading.waitFor();

  // Navigate back to Orders & Attendees to send message
  await organizerPage.goto(currentURL);
  await organizerPage.getByRole('link', { name: 'Orders & Attendees' }).click();

  // Send message to attendees
  await organizerPage
    .getByRole('button', { name: 'Message Attendees' })
    .click();
  await organizerPage
    .getByRole('textbox', { name: 'Enter the subject...' })
    .click();
  await organizerPage
    .getByRole('textbox', { name: 'Enter the subject...' })
    .fill(uniqueSubject);

  // Fill message body
  await organizerPage
    .locator('iframe[title="Rich Text Area"]')
    .contentFrame()
    .getByRole('paragraph')
    .click();
  await organizerPage
    .locator('iframe[title="Rich Text Area"]')
    .contentFrame()
    .getByLabel('Rich Text Area')
    .fill(MESSAGE_BODY);

  // Send message
  await organizerPage.getByRole('button', { name: 'Send' }).click();

  // Verify success message
  const successMessage = organizerPage.getByText('Message sent successfully!');
  await successMessage.waitFor();

  // Close the modal
  await organizerPage.getByRole('button', { name: 'Close' }).click();

  // Navigate to Communications tab to verify the message appears
  await organizerPage.getByRole('link', { name: 'Communications' }).click();

  // Verify the message appears in the communications table with the unique subject
  const messageCell = organizerPage.getByRole('cell', {
    name: uniqueSubject,
  });

  return { confirmationHeading, successMessage, messageCell };
}

// Helper function for event duplication logic
async function performEventDuplication(
  organizerPage: Page,
  originalEventTitle: string
) {
  // Generate timestamp for unique naming
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const duplicatedEventTitle = `${originalEventTitle} (Duplicated at ${timestamp})`;

  // Go to Event Settings
  await organizerPage.getByRole('link', { name: 'Event Settings' }).click();

  // Start duplication process
  await organizerPage.getByRole('button', { name: 'Duplicate Event' }).click();

  // Find the event name field in the duplicate modal and update it
  // The field should contain the current event title by default
  const eventNameField = organizerPage.getByRole('textbox').first();
  await eventNameField.click();
  await eventNameField.clear(); // Clear existing text
  await eventNameField.fill(duplicatedEventTitle);

  // Set the new date
  await organizerPage
    .getByRole('textbox', { name: 'New Start Date and Time' })
    .click();

  await organizerPage
    .getByRole('textbox', { name: 'New Start Date and Time' })
    .fill('2040-08-20T10:00');

  // Complete the duplication
  await organizerPage.getByRole('button', { name: 'Duplicate' }).click();

  // Navigate to events list to find the specific duplicated event
  await organizerPage.getByRole('link', { name: 'Events' }).click();
  await organizerPage.getByRole('textbox', { name: 'Search Events' }).click();

  // Search for the new duplicated event title
  await organizerPage
    .getByRole('textbox', { name: 'Search Events' })
    .fill(duplicatedEventTitle);

  // Wait for search results
  await organizerPage.waitForTimeout(1000);

  await organizerPage.getByText(duplicatedEventTitle).click();
  // Click on the specific duplicated event
  const duplicatedEventLink = organizerPage
    .getByRole('link')
    .filter({ hasText: duplicatedEventTitle })
    .first();

  await duplicatedEventLink.click();

  return duplicatedEventTitle;
}

export async function duplicateEvent(organizerPage: Page) {
  // First, get the current event title
  await organizerPage.getByRole('link', { name: 'Edit Event' }).click();
  await organizerPage.getByRole('textbox', { name: 'Event Title' }).click();
  const eventTitle = await organizerPage
    .getByRole('textbox', { name: 'Event Title' })
    .inputValue();

  // Perform the duplication using shared logic
  await performEventDuplication(organizerPage, eventTitle);

  // Return a locator to verify we're on the duplicated event page
  return organizerPage.getByRole('link', { name: 'Edit Event' });
}

export async function duplicateEventWithPromoCodes(organizerPage: Page) {
  // Generate unique promo code with timestamp
  const uniquePromoCode = generateUniquePromoCode();

  // First, get the current event title
  await organizerPage.getByRole('link', { name: 'Edit Event' }).click();
  await organizerPage.getByRole('textbox', { name: 'Event Title' }).click();
  const eventTitle = await organizerPage
    .getByRole('textbox', { name: 'Event Title' })
    .inputValue();

  // Go to Promote tab and add promo codes to the original event
  await organizerPage.getByRole('link', { name: 'Promote' }).click();

  // Add new promo code
  await organizerPage.getByRole('button', { name: 'Add Promo Code' }).click();
  await organizerPage
    .getByRole('textbox', { name: 'Enter promo code' })
    .click();
  await organizerPage
    .getByRole('textbox', { name: 'Enter promo code' })
    .fill(uniquePromoCode);
  await organizerPage.getByPlaceholder('Enter discount percentage').click();
  await organizerPage
    .getByPlaceholder('Enter discount percentage')
    .fill(EVENT_PROMO_DISCOUNT);
  await organizerPage
    .locator('form')
    .getByRole('button', { name: 'Add Promo Code' })
    .click();

  // Add to event - use search approach to find the specific promo code
  await organizerPage
    .getByRole('textbox', { name: 'Search your organizer promo codes...' })
    .click();
  await organizerPage
    .getByRole('textbox', { name: 'Search your organizer promo codes...' })
    .fill(uniquePromoCode);
  await organizerPage.getByText(uniquePromoCode).click();
  await organizerPage.getByRole('button', { name: 'Add to Event' }).click();
  await organizerPage.getByLabel('Select a Ticket Type').selectOption('all');
  await organizerPage.getByRole('button', { name: 'Attach' }).click();

  // Wait a moment for promo code operations to complete
  await organizerPage.waitForTimeout(2000);

  // Now duplicate the event using shared logic
  await performEventDuplication(organizerPage, eventTitle);

  // Go to Promote tab to verify promo codes were duplicated
  await organizerPage.getByRole('link', { name: 'Promote' }).click();

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

  // Return a locator to verify we're on the duplicated event's promote page
  return organizerPage.getByRole('button', { name: 'Add Promo Code' });
}

export async function resendConfirmationEmail(organizerPage: Page) {
  // Go to Orders & Attendees
  await organizerPage.getByRole('link', { name: 'Orders & Attendees' }).click();

  // Find and click on the first order (assuming it exists from previous booking)
  // This is a simplified version - in a real scenario you'd search for a specific order
  const orderCells = organizerPage
    .getByRole('cell')
    .filter({ hasText: /^[A-Z0-9]{12}$/ });
  const firstOrderCell = orderCells.first();

  await firstOrderCell.click();

  // Send confirmation email
  await organizerPage
    .getByRole('button', { name: 'Send Ticket Confirmation Email' })
    .click();

  // Note: There might not be a visible success message for this action
  // Return a locator that should be present after the action
  return organizerPage.getByRole('button', {
    name: 'Email Sent',
  });
}
