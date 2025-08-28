import { test, expect } from '@playwright/test';
import {
  selectFirstOrganizer,
  addPerformer,
  editPerformer,
  deletePerformer,
} from '../../helpers/organizerHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the manage performers functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing organizer being available.
test('managePerformers', async ({ page }) => {
  console.log('[INFO] Executing Manage Performers test...');

  // Sign in and select first organizer
  await selectFirstOrganizer(page);

  await page.getByRole('link', { name: 'Manage' }).click();

  // Add a new performer
  const performerHeading = await addPerformer(page);
  await expect(performerHeading).toBeVisible();

  // Edit the performer
  const updatedPerformerHeading = await editPerformer(page);
  await expect(updatedPerformerHeading).toBeVisible();

  // Delete the performer
  await deletePerformer(page);

  console.log('[INFO] Manage Performers test completed successfully.');
});
