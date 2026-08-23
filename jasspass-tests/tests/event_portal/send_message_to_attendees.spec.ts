import { test, expect } from '../../fixtures/application';
import {
  openEventOrganizerPortal,
  sendMessageToAttendees,
} from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that sending messages to attendees functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('sendMessageToAttendees', async ({ ownerPage, eventFactory }) => {
  console.log('[INFO] Executing Send Message to Attendees test...');

  const created = await eventFactory.create({ isFreeEvent: true });
  const organizerPage = await openEventOrganizerPortal(ownerPage, created.id);

  // Send message to attendees
  const sendButton = await sendMessageToAttendees(organizerPage);

  // Verify modal closed (Send button is no longer visible)
  await expect(sendButton).toBeHidden();

  console.log('[INFO] Send Message to Attendees test completed successfully.');
});
