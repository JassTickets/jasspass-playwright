import { test, expect } from '@playwright/test';
import { deleteOrganizer } from '../helpers/organizerHelpers';

// @Description: This test verifies that the delete-organizer functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and create-organizer functionality being correct.
test('deleteOrganizer', async ({ page }) => {
  const id = await deleteOrganizer(page);
  await expect(page).toHaveURL(new RegExp(`portal/organizer`));
});
