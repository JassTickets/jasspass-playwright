import { test, expect } from '@playwright/test';
import { deleteEvent } from '../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the delete-event functionality works correctly.
// @Dependencies: Depends on the sign-in, create-organizer, create-event, purchase-ticket, and refund-ticket functionalities being correct.
test('deleteEvent', async ({ page }) => {
  const organizerId = await deleteEvent(page);
});
