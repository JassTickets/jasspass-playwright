import { test, expect } from '@playwright/test';
import {
  selectFirstEventStartingWithPBO,
  bookComplimentaryTicket,
} from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that booking complimentary tickets from organizer portal works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('bookComplimentaryTicket', async ({ page }) => {
  console.log('[INFO] Executing Book Complimentary Ticket test...');

  // Sign in and select first event starting with PBO
  const organizerPage = await selectFirstEventStartingWithPBO(page);

  // Book complimentary ticket
  const confirmationHeading = await bookComplimentaryTicket(organizerPage);

  // Verify confirmation heading is visible
  await expect(confirmationHeading).toBeVisible();

  console.log('[INFO] Book Complimentary Ticket test completed successfully.');
});
