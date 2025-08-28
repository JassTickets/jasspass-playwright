import { test, expect } from '@playwright/test';
import { deleteEvent } from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the delete-event functionality works correctly.
// @Dependencies: Depends on the sign-in, create-organizer, create-event, purchase-ticket, and refund-ticket functionalities being correct.
test('deleteEvent', async ({ page }) => {
  console.log('[INFO] Executing Delete Event test...');
  const organizerId = await deleteEvent(page);
  console.log('[INFO] Delete Event test completed successfully.');
});
