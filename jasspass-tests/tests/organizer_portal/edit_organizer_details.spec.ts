import { test, expect } from '@playwright/test';
import {
  createOrganizer,
  editOrganizerDetails,
} from '../../helpers/organizerHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the edit organizer details functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing organizer being available.
test('editOrganizerDetails', async ({ page }) => {
  console.log('[INFO] Executing Edit Organizer Details test...');

  const organizerId = await createOrganizer(page);

  // Edit organizer details
  const successMessage = await editOrganizerDetails(page);

  // Verify success message is visible
  await expect(successMessage).toBeVisible();
  const deleteResponse = await page.evaluate(async (id) => {
    const response = await fetch(`/api/protected/organizers/${id}`, {
      method: 'DELETE',
    });
    return response.ok;
  }, organizerId);
  expect(deleteResponse).toBe(true);

  console.log('[INFO] Edit Organizer Details test completed successfully.');
});

test('editOrganizerDetailsWithManualAddress', async ({ page }) => {
  console.log(
    '[INFO] Executing Edit Organizer Details with manual address test...'
  );

  const organizerId = await createOrganizer(page);

  const successMessage = await editOrganizerDetails(page, {
    addressEntry: 'manual',
  });

  await expect(successMessage).toBeVisible();
  const deleteResponse = await page.evaluate(async (id) => {
    const response = await fetch(`/api/protected/organizers/${id}`, {
      method: 'DELETE',
    });
    return response.ok;
  }, organizerId);
  expect(deleteResponse).toBe(true);

  console.log(
    '[INFO] Edit Organizer Details with manual address test completed successfully.'
  );
});
