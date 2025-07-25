import { test, expect } from '@playwright/test';
import { deleteOrganizer } from '../helpers/organizerHelpers';

test.setTimeout(60_000);

// @Description: This test verifies the end to end functionality of the system works correctly.
test('deleteOrganizer', async ({ page }) => {
  console.log('[INFO] Executing Delete Organizer test...');
  const id = await deleteOrganizer(page, false); // False indicates we are not using the seed environment, but rather creating everything from scratch.
  console.log('[INFO] Delete Organizer test completed successfully.');
});
