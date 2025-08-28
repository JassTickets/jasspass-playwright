import { test, expect } from '@playwright/test';
import { deleteOrganizer } from '../../helpers/organizerHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the delete-organizer functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and create-organizer functionality being correct.
test('deleteOrganizer', async ({ page }) => {
  console.log('[INFO] Executing Delete Organizer test...');
  const id = await deleteOrganizer(page);
  console.log('[INFO] Delete Organizer test completed successfully.');
});
