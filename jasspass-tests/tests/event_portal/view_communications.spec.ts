import { test, expect } from '@playwright/test';
import { selectFirstEventStartingWithPBO } from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that viewing event communications functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.

test('viewEventCommunications', async ({ page }) => {
  console.log('[INFO] Executing View Event Communications test...');

  // Sign in and select first event starting with PBO
  const organizerPage = await selectFirstEventStartingWithPBO(page);

  // Navigate to Communications tab
  await organizerPage.getByRole('button', { name: 'Communications' }).click();
  // Generate a random test subject and body
  const randomSubject = `Test Email Subject ${Date.now()}`;

  // Send a test email
  await organizerPage
    .getByRole('button')
    .filter({ hasText: 'Message Attendees' })
    .click();
  await organizerPage
    .getByRole('textbox', { name: 'Enter the subject...' })
    .click();
  await organizerPage
    .getByRole('textbox', { name: 'Enter the subject...' })
    .fill(randomSubject);

  // Click next
  await organizerPage.getByRole('button', { name: 'Next' }).click();
  await organizerPage.locator('#message-body').click();
  await organizerPage.locator('#message-body').fill(randomSubject);
  await organizerPage.getByRole('button', { name: 'Send' }).click();
  // If the modal closes it means that it worked

  // Verify that the message appears in the communications list

  // Refresh
  await organizerPage
    .locator('div')
    .filter({ hasText: /^OutboundInbound$/ })
    .getByRole('button')
    .nth(2)
    .click();

  // Timeout
  await organizerPage.waitForTimeout(1000);

  await organizerPage
    .getByRole('textbox', { name: 'Search emails...' })
    .click();
  await organizerPage
    .getByRole('textbox', { name: 'Search emails...' })
    .fill(randomSubject);

  // Wait for 2 seconds

  await organizerPage.getByRole('heading', { name: randomSubject }).click();

  console.log('[INFO] View Event Communications test completed successfully.');
});
