import { test } from '@playwright/test';
import {
  createOrganizer,
  addPerformer,
  editPerformer,
  deletePerformer,
} from '../../helpers/organizerHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the manage performers functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing organizer being available.
test('managePerformers', async ({ page }) => {
  console.log('[INFO] Executing Manage Performers test...');

  await createOrganizer(page);

  // Add a new performer
  const performerName = await addPerformer(page);

  // Edit the performer
  const updatedPerformerName = await editPerformer(page, performerName);

  // Delete the performer
  await deletePerformer(page, updatedPerformerName);

  console.log('[INFO] Manage Performers test completed successfully.');
});
