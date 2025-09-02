import { test, expect } from '@playwright/test';
import {
  selectFirstEventStartingWithPBO,
  manageEventAttendeesAndCommunications,
} from '../../helpers/eventHelpers';

test.setTimeout(120_000);

// @Description: This test verifies the complete attendee management and communications workflow.
// It books a complimentary ticket, sends a message to attendees, and verifies the message appears in communications.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('manageEventAttendeesAndCommunications', async ({ page }) => {
  console.log(
    '[INFO] Executing Manage Event Attendees and Communications test...'
  );

  // Sign in and select first event starting with PBO
  const organizerPage = await selectFirstEventStartingWithPBO(page);

  // Execute the complete workflow: book ticket, send message, verify communications
  const { confirmationHeading, successMessage, messageCell } =
    await manageEventAttendeesAndCommunications(organizerPage);

  console.log(
    '[INFO] Manage Event Attendees and Communications test completed successfully.'
  );
});
