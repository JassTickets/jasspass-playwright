import { test, expect } from '@playwright/test';
import {
  addTeamMember,
  createOrganizer,
} from '../../helpers/organizerHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the manage team members functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing organizer being available.
test('manageTeamMembers', async ({ page }) => {
  console.log('[INFO] Executing Manage Team Members test...');

  await createOrganizer(page);

  const memberRow = await addTeamMember(page);
  await expect(memberRow).toBeVisible();

  console.log('[INFO] Manage Team Members test completed successfully.');
});
