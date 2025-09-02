import { test, expect } from '@playwright/test';
import {
  selectFirstEventStartingWithPBO,
  editEventAdditionalDetails,
} from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the edit event additional details functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('editEventAdditionalDetails', async ({ page }) => {
  console.log('[INFO] Executing Edit Event Additional Details test...');

  // Sign in and select first event starting with PBO
  const organizerPage = await selectFirstEventStartingWithPBO(page);

  // Edit event additional details
  const successMessage = await editEventAdditionalDetails(organizerPage);

  // Verify success message is visible
  await expect(successMessage).toBeVisible();

  console.log(
    '[INFO] Edit Event Additional Details test completed successfully.'
  );
});
