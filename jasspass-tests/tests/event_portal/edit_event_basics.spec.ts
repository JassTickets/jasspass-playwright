import { test, expect } from '@playwright/test';
import {
  selectFirstEventStartingWithPBO,
  editEventBasics,
} from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the edit event basics functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('editEventBasics', async ({ page }) => {
  console.log('[INFO] Executing Edit Event Basics test...');

  // Sign in and select first event starting with PBO
  const organizerPage = await selectFirstEventStartingWithPBO(page);

  // Edit event basics
  const successMessage = await editEventBasics(organizerPage);

  // Verify success message is visible
  await expect(successMessage).toBeVisible();

  console.log('[INFO] Edit Event Basics test completed successfully.');
});
