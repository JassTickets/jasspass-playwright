import { test, expect } from '../../fixtures/application';
import {
  editEventBasics,
  openEventOrganizerPortal,
} from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the edit event basics functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('editEventBasics', async ({ ownerPage, eventFactory }) => {
  console.log('[INFO] Executing Edit Event Basics test...');

  const created = await eventFactory.create();
  const organizerPage = await openEventOrganizerPortal(ownerPage, created.id);

  // Edit event basics
  const savedTitle = await editEventBasics(organizerPage);

  // Verify the saved title remains visible in the editor.
  await expect(savedTitle).toBeVisible();

  console.log('[INFO] Edit Event Basics test completed successfully.');
});
