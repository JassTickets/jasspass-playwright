import { test } from '../../fixtures/application';
import {
  manageEventPromoCodes,
  openEventOrganizerPortal,
} from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the event promo codes management functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('manageEventPromoCodes', async ({ ownerPage, eventFactory }) => {
  console.log('[INFO] Executing Manage Event Promo Codes test...');

  const created = await eventFactory.create();
  const organizerPage = await openEventOrganizerPortal(ownerPage, created.id);

  // Manage event promo codes (add, modify, detach, delete)
  await manageEventPromoCodes(organizerPage);

  console.log('[INFO] Manage Event Promo Codes test completed successfully.');
});
