import { test, expect } from '../../fixtures/application';
import { JASS_TEST_URL } from '../../constants';
import { manageEventAttendeesAndCommunications } from '../../helpers/eventHelpers';

test.setTimeout(180_000);

// @Description: This test verifies the complete attendee management and communications workflow.
// It books a complimentary ticket, sends a message to attendees, and verifies the message appears in communications.
// @Dependencies: Depends on sign-in and create-event functionality.
test('manageEventAttendeesAndCommunications', async ({
  ownerPage,
  ownerIdentity,
  eventFactory,
}) => {
  console.log(
    '[INFO] Executing Manage Event Attendees and Communications test...'
  );

  const created = await eventFactory.create();
  await ownerPage.goto(
    `${JASS_TEST_URL}/portal/organizer/company/${ownerIdentity.organizerId}/event/${created.id}`,
    { waitUntil: 'domcontentloaded' }
  );

  // Execute the complete workflow: book ticket, send message, verify communications
  const { sendButton, messageHeading } =
    await manageEventAttendeesAndCommunications(ownerPage);

  await expect(sendButton).toBeHidden();
  await expect(messageHeading).toBeVisible({ timeout: 30_000 });

  console.log(
    '[INFO] Manage Event Attendees and Communications test completed successfully.'
  );
});
