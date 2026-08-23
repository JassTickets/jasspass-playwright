import { test, expect } from '../../fixtures/application';
import {
  editEventAdditionalDetails,
  openEventOrganizerPortal,
} from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the edit event additional details functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('editEventAdditionalDetails', async ({ ownerPage, eventFactory }) => {
  console.log('[INFO] Executing Edit Event Additional Details test...');

  const created = await eventFactory.create();
  const organizerPage = await openEventOrganizerPortal(ownerPage, created.id);

  // Edit event additional details
  const savedTaxRate = await editEventAdditionalDetails(organizerPage);

  // Verify the saved advanced value is rendered when its sheet is reopened.
  await expect(savedTaxRate).toBeVisible();

  console.log(
    '[INFO] Edit Event Additional Details test completed successfully.'
  );
});
