import { test, expect } from '@playwright/test';
import {
  selectFirstEventStartingWithPBO,
  sendMessageToAttendees,
} from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that sending messages to attendees functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('sendMessageToAttendees', async ({ page }) => {
  console.log('[INFO] Executing Send Message to Attendees test...');

  // Sign in and select first event starting with PBO
  const organizerPage = await selectFirstEventStartingWithPBO(page);

  // Send message to attendees
  const successMessage = await sendMessageToAttendees(organizerPage);

  // Verify success message is visible
  await expect(successMessage).toBeVisible();

  // Close the modal
  await organizerPage.getByRole('button', { name: 'Close' }).click();

  console.log('[INFO] Send Message to Attendees test completed successfully.');
});
