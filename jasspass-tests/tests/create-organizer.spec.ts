import { test, expect } from '@playwright/test';
import { createOrganizer } from '../helpers/organizerHelpers';

// @Description: This test verifies that the create-organizer functionality works correctly.
// @Dependencies: Depends on the sign-in functionality being correct.
test('createOrganizer', async ({ page }) => {
  const id = await createOrganizer(page);
  await expect(page).toHaveURL(new RegExp(`company/${id}$`));
});
