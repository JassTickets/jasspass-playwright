import { test, expect } from '@playwright/test';
import { signIn, signOutIfSignedIn } from '../../helpers/auth';
import {
  selectFirstOrganizer,
  testOperatorPoliciesFlow,
  addOperatorWithAllPolicies,
} from '../../helpers/organizerHelpers';
import {
  createEvent,
  verifyOperatorAccess,
  purchaseTicket,
} from '../../helpers/eventHelpers';
import {
  PLAYWRIGHT_BOT_EMAIL,
  PLAYWRIGHT_BOT_PASSWORD,
  PLAYWRIGHT_BOT2_EMAIL,
  PLAYWRIGHT_BOT2_PASSWORD,
  JASS_TEST_URL,
} from '../../constants';

test.setTimeout(240_000); // 4 minutes timeout for complex flow

// @Description: This test verifies the complete operator policy flow - adding an operator with all policies and verifying their access
// @Dependencies: Requires existing organizer and event, sign-in functionality
test('operator policies comprehensive flow', async ({ browser }) => {
  console.log('[INFO] Starting operator policies comprehensive flow test...');

  // Create two browser contexts to simulate two different users
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  const page1 = await context1.newPage(); // Main organizer
  const page2 = await context2.newPage(); // Operator

  try {
    // STEP 1: Create a new event for testing
    console.log(
      '[INFO] Step 1: Creating new event for operator policy testing...',
    );
    const eventName = `Operator Policy Test Event ${Date.now()}`;
    const eventId = await createEvent(page1, { eventName });

    // Purchase a ticket to create orders and attendees for testing
    console.log('[INFO] Step 1.5: Purchasing ticket to create test data...');
    await purchaseTicket(page1, eventId);

    // Navigate to the event's organizer view
    await page1.goto(`${JASS_TEST_URL}/event/${eventId}`);
    const organizerPagePromise = page1.waitForEvent('popup');
    await page1.getByText('Organizer View').click();
    const organizerPage = await organizerPagePromise;
    await organizerPage.waitForTimeout(1000);

    // STEP 2: Add operator with policies
    console.log('[INFO] Step 2: Adding operator with all policies...');
    await addOperatorWithAllPolicies(organizerPage, PLAYWRIGHT_BOT2_EMAIL);

    // Wait for policies to be saved
    await organizerPage.waitForTimeout(2000);

    // STEP 3: Sign in as operator and verify access
    console.log(
      '[INFO] Step 3: Signing in as operator and verifying access...',
    );
    await page2.goto(`${JASS_TEST_URL}/portal/organizer`);

    // Sign out if already signed in
    await signOutIfSignedIn(page2);

    // Sign in with operator credentials
    await signIn(page2, {
      email: PLAYWRIGHT_BOT2_EMAIL,
      password: PLAYWRIGHT_BOT2_PASSWORD,
    });

    // Wait for sign in to complete
    await page2.waitForTimeout(3000);

    // Verify operator access
    await verifyOperatorAccess(page2, eventName);

    console.log(
      '[INFO] Operator policies comprehensive flow test completed successfully!',
    );
  } finally {
    // Clean up contexts
    await context1.close();
    await context2.close();
  }
});
