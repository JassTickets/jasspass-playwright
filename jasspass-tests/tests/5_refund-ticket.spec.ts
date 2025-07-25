import { test, expect } from '@playwright/test';
import { refundTicket } from '../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the refund functionality works correctly.
// @Dependencies: Depends on the sign-in, create-organizer, create-event, and purchase-ticket functionalities being correct.
test('refundTicket', async ({ page }) => {
  console.log('[INFO] Executing Refund Ticket test...');
  const { successBanner } = await refundTicket(page, false);
  await expect(successBanner).toBeVisible();
  console.log('[INFO] Refund Ticket test completed successfully.');
});
