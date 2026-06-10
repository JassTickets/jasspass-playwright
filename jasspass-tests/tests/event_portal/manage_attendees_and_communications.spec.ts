import { test, expect } from '@playwright/test';
import {
  createEventAndOpenOrganizerPortal,
  manageEventAttendeesAndCommunications,
} from '../../helpers/eventHelpers';

test.setTimeout(180_000);

// @Description: This test verifies the complete attendee management and communications workflow.
// It books a complimentary ticket, sends a message to attendees, and verifies the message appears in communications.
// @Dependencies: Depends on sign-in and create-event functionality.
test('manageEventAttendeesAndCommunications', async ({ page }) => {
  console.log(
    '[INFO] Executing Manage Event Attendees and Communications test...',
  );

  // Create a fresh event so complimentary ticket inventory is isolated for this test.
  const organizerPage = await createEventAndOpenOrganizerPortal(page);

  // Execute the complete workflow: book ticket, send message, verify communications
  const { sendButton, messageCell } =
    await manageEventAttendeesAndCommunications(organizerPage);

  await expect(sendButton).toBeHidden();

  console.log(
    '[INFO] Manage Event Attendees and Communications test completed successfully.',
  );
});
