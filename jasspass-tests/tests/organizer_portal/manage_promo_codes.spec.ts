import { test, expect } from '@playwright/test';
import {
  selectFirstOrganizer,
  addPromoCode,
  editPromoCode,
  deletePromoCode,
} from '../../helpers/organizerHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the manage promo codes functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing organizer being available.
test('managePromoCodes', async ({ page }) => {
  console.log('[INFO] Executing Manage Promo Codes test...');

  // Sign in and select first organizer
  await selectFirstOrganizer(page);
  await page.getByRole('link', { name: 'Manage' }).click();

  // Add a new promo code
  const promoCodeElement = await addPromoCode(page);
  await expect(promoCodeElement).toBeVisible();

  // Edit the promo code
  const updatedPromoCodeElement = await editPromoCode(page);
  await expect(updatedPromoCodeElement).toBeVisible();

  // Delete the promo code
  await deletePromoCode(page);

  console.log('[INFO] Manage Promo Codes test completed successfully.');
});
