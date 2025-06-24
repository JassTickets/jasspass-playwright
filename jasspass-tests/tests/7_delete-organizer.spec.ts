import { test, expect } from '@playwright/test';
import { deleteOrganizer } from '../helpers/organizerHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the delete-organizer functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and create-organizer functionality being correct.
test('deleteOrganizer', async ({ page }) => {
  const id = await deleteOrganizer(page);
});
