import { test, expect } from '@playwright/test';
import {
  selectFirstEventStartingWithPBO,
  manageEventPromoCodes,
} from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the event promo codes management functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('manageEventPromoCodes', async ({ page }) => {
  console.log('[INFO] Executing Manage Event Promo Codes test...');

  // Sign in and select first event starting with PBO
  const organizerPage = await selectFirstEventStartingWithPBO(page);

  // Manage event promo codes (add, modify, detach, delete)
  await manageEventPromoCodes(organizerPage);

  console.log('[INFO] Manage Event Promo Codes test completed successfully.');
});
