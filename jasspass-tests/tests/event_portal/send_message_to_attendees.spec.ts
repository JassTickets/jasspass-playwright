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
  const sendButton = await sendMessageToAttendees(organizerPage);

  // Verify modal closed (Send button is no longer visible)
  await expect(sendButton).toBeHidden();

  console.log('[INFO] Send Message to Attendees test completed successfully.');
});
