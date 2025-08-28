import { test, expect } from '@playwright/test';
import {
  selectFirstOrganizer,
  editOrganizerDetails,
} from '../../helpers/organizerHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the edit organizer details functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing organizer being available.
test('editOrganizerDetails', async ({ page }) => {
  console.log('[INFO] Executing Edit Organizer Details test...');

  // Sign in and select first organizer
  await selectFirstOrganizer(page);

  await page.getByRole('link', { name: 'Manage' }).click();

  // Edit organizer details
  const successMessage = await editOrganizerDetails(page);

  // Verify success message is visible
  await expect(successMessage).toBeVisible();

  console.log('[INFO] Edit Organizer Details test completed successfully.');
});
