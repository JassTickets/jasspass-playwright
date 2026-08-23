import { test, expect } from '../../fixtures/application';
import {
  duplicateEvent,
  openEventOrganizerPortal,
} from '../../helpers/eventHelpers';

test.setTimeout(120_000);

// @Description: This test verifies that event duplication functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('duplicateEvent', async ({ ownerPage, eventFactory }) => {
  console.log('[INFO] Executing Duplicate Event test...');

  const created = await eventFactory.create();
  const organizerPage = await openEventOrganizerPortal(ownerPage, created.id);

  // Duplicate the event
  const duplicatedEventEditButton = await duplicateEvent(organizerPage);
  await expect(duplicatedEventEditButton).toBeVisible({ timeout: 30_000 });

  console.log('[INFO] Duplicate Event test completed successfully.');
});
