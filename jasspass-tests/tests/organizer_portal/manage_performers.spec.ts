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
  const performerName = await addPerformer(page);

  // Edit the performer
  const updatedPerformerName = await editPerformer(page, performerName);
  await expect(
    page.getByRole('heading', { name: updatedPerformerName })
  ).toBeVisible();

  // Delete the performer
  await deletePerformer(page);

  console.log('[INFO] Manage Performers test completed successfully.');
});
