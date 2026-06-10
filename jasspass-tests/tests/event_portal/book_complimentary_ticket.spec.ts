import { test, expect } from '@playwright/test';
import {
  createEventAndOpenOrganizerPortal,
  bookComplimentaryTicket,
} from '../../helpers/eventHelpers';

test.setTimeout(180_000);

// @Description: This test verifies that booking complimentary tickets from organizer portal works correctly.
// @Dependencies: Depends on sign-in and create-event functionality.
test('bookComplimentaryTicket', async ({ page }) => {
  console.log('[INFO] Executing Book Complimentary Ticket test...');

  // Create a fresh event so complimentary ticket inventory is isolated for this test.
  const organizerPage = await createEventAndOpenOrganizerPortal(page);

  // Book complimentary ticket
  const confirmationHeading = await bookComplimentaryTicket(organizerPage);

  // Verify confirmation heading is visible
  await expect(confirmationHeading).toBeVisible();

  console.log('[INFO] Book Complimentary Ticket test completed successfully.');
});
