import { JASS_TEST_URL } from '../../constants';
import { test } from '../../fixtures/application';
import {
  bookComplimentaryTicket,
  resendConfirmationEmail,
} from '../../helpers/eventHelpers';

test.setTimeout(180_000);

// @Description: This test verifies that resending confirmation emails functionality works correctly.
// @Dependencies: Depends on sign-in and create-event functionality.
test('resendConfirmationEmail', async ({
  ownerPage,
  ownerIdentity,
  eventFactory,
}) => {
  console.log('[INFO] Executing Resend Confirmation Email test...');

  const created = await eventFactory.create();
  const organizerPortalUrl = `${JASS_TEST_URL}/portal/organizer/company/${ownerIdentity.organizerId}/event/${created.id}`;
  await ownerPage.goto(organizerPortalUrl, { waitUntil: 'domcontentloaded' });
  await bookComplimentaryTicket(ownerPage);
  await ownerPage.goto(organizerPortalUrl, { waitUntil: 'domcontentloaded' });

  // Attempt to resend confirmation email
  await resendConfirmationEmail(ownerPage);

  console.log('[INFO] Resend Confirmation Email test completed successfully.');
});
