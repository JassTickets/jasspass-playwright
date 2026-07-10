import { test } from '@playwright/test';
import {
  createEventAndOpenOrganizerPortal,
  bookComplimentaryTicket,
  resendConfirmationEmail,
} from '../../helpers/eventHelpers';

test.setTimeout(180_000);

// @Description: This test verifies that resending confirmation emails functionality works correctly.
// @Dependencies: Depends on sign-in and create-event functionality.
test('resendConfirmationEmail', async ({ page }) => {
  console.log('[INFO] Executing Resend Confirmation Email test...');

  // Create a fresh event and order so the resend flow has a known target.
  const organizerPage = await createEventAndOpenOrganizerPortal(page);
  const organizerPortalUrl = organizerPage.url();
  await bookComplimentaryTicket(organizerPage);
  await organizerPage.goto(organizerPortalUrl);

  // Attempt to resend confirmation email
  await resendConfirmationEmail(organizerPage);

  console.log('[INFO] Resend Confirmation Email test completed successfully.');
});
