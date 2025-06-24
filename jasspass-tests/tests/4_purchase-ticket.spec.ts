import { test, expect } from '@playwright/test';
import { purchaseTicket } from '../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the purchase functionality works correctly.
// @Dependencies: Depends on the sign-in, create-organizer and create-event functionalities being correct.
test('purchaseTicket', async ({ page }) => {
  const id = await purchaseTicket(page);
  await expect(page).toHaveURL(new RegExp(`payment/success`));
});
