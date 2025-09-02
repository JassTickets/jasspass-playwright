import { test, expect } from '@playwright/test';
import {
  selectFirstEventStartingWithPBO,
  editEventTimeAndLocation,
} from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the edit event time and location functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('editEventTimeAndLocation', async ({ page }) => {
  console.log('[INFO] Executing Edit Event Time and Location test...');

  // Sign in and select first event starting with PBO
  const organizerPage = await selectFirstEventStartingWithPBO(page);

  // Edit event time and location
  const successMessage = await editEventTimeAndLocation(organizerPage);

  // Verify success message is visible
  await expect(successMessage).toBeVisible();

  console.log(
    '[INFO] Edit Event Time and Location test completed successfully.'
  );
});
