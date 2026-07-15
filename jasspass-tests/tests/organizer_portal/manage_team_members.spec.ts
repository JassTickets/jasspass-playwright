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

  const memberRow = await addTeamMember(page);
  await expect(memberRow).toBeVisible();

  // Persisted-state assertion: the representative remains after a fresh read.
  await page.reload();
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByRole('button', { name: 'Team' }).click();
  await expect(memberRow).toBeVisible({ timeout: 30_000 });

  console.log('[INFO] Manage Team Members test completed successfully.');
});
