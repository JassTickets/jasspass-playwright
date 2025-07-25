import { test, expect } from '@playwright/test';
import { createOrganizer } from '../helpers/organizerHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the create-organizer functionality works correctly.
// @Dependencies: Depends on the sign-in functionality being correct.
test('createOrganizer', async ({ page }) => {
  console.log('[INFO] Executing Create Organizer test...');
  const id = await createOrganizer(page);
  await expect(page).toHaveURL(new RegExp(`company/${id}$`));
  console.log('[INFO] Create Organizer test completed successfully.');
});
