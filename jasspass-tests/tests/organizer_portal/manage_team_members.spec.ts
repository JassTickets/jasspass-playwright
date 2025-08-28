import { test, expect } from '@playwright/test';
import {
  selectFirstOrganizer,
  addTeamMember,
  editTeamMemberRole,
  deleteTeamMember,
} from '../../helpers/organizerHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that the manage team members functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing organizer being available.
test('manageTeamMembers', async ({ page }) => {
  console.log('[INFO] Executing Manage Team Members test...');

  // Sign in and select first organizer
  await selectFirstOrganizer(page);
  await page.getByRole('link', { name: 'Manage' }).click();

  // Add a new team member
  const teamMemberRow = await addTeamMember(page);
  await expect(teamMemberRow).toBeVisible();

  // Edit the team member role
  await editTeamMemberRole(page);

  // Delete the team member
  await deleteTeamMember(page);

  console.log('[INFO] Manage Team Members test completed successfully.');
});
