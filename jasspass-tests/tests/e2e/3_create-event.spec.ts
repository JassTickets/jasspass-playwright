import { test, expect } from '@playwright/test';
import { createEvent } from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the create-event functionality works correctly.
// @Dependencies: Depends on the sign-in and create organizer functionalities being correct.
test('createEvent', async ({ page }) => {
  console.log('[INFO] Executing Create Event test...');
  const id = await createEvent(page);
  await expect(page).toHaveURL(new RegExp(`event/${id}$`));
  console.log('[INFO] Create Event test completed successfully.');
});
