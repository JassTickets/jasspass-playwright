import { test, expect } from '@playwright/test';
import {
  selectFirstOrganizer,
  accessStripeFinance,
} from '../../helpers/organizerHelpers';
import { PLAYWRIGHT_BOT_STRIPE_CONNECT_ID } from '../../constants';

test.setTimeout(60_000);

// @Description: This test verifies that the access finance/Stripe dashboard functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing organizer being available.
test('accessFinanceStripe', async ({ page }) => {
  console.log('[INFO] Executing Access Finance Stripe test...');

  // Sign in and select first organizer
  await selectFirstOrganizer(page);

  await page
    .getByRole('textbox', { name: 'acct_xxx...' })
    .fill(PLAYWRIGHT_BOT_STRIPE_CONNECT_ID);
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('link', { name: 'Manage' }).click();

  // Access Stripe finance dashboard
  const stripePage = await accessStripeFinance(page);

  // Verify that a new page was opened (Stripe dashboard)
  await expect(stripePage).toBeTruthy();

  // Verify the URL contains stripe.com (or similar indication it's Stripe)
  const stripeUrl = stripePage.url();
  expect(stripeUrl).toMatch(/stripe/);

  // Close the Stripe tab
  await stripePage.close();

  console.log('[INFO] Access Finance Stripe test completed successfully.');
});
