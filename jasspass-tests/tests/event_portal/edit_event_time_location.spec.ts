import { test, expect } from '../../fixtures/application';
import {
  editEventTimeAndLocation,
  openEventOrganizerPortal,
} from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the edit event time and location functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('editEventTimeAndLocation', async ({ ownerPage, eventFactory }) => {
  console.log('[INFO] Executing Edit Event Time and Location test...');

  const created = await eventFactory.create();
  const organizerPage = await openEventOrganizerPortal(ownerPage, created.id);

  // Edit event time and location
  const savedLocation = await editEventTimeAndLocation(organizerPage);

  // Verify the saved location is reflected in the editor.
  await expect(savedLocation).toBeVisible();

  console.log(
    '[INFO] Edit Event Time and Location test completed successfully.'
  );
});
