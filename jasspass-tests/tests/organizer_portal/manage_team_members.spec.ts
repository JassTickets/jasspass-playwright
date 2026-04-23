import { test, expect } from '@playwright/test';
import {
  selectFirstOrganizer,
  addTeamMember,
} from '../../helpers/organizerHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the manage team members functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing organizer being available.
test('manageTeamMembers', async ({ page }) => {
  console.log('[INFO] Executing Manage Team Members test...');

  // Sign in and select first organizer
  await selectFirstOrganizer(page);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();

  console.log('[INFO] Manage Team Members test completed successfully.');
});
