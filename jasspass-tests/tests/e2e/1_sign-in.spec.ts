import { test, expect } from '@playwright/test';
import { signIn } from '../../helpers/auth';

test.setTimeout(60_000);

// @Description: This test verifies that the sign-in functionality works correctly.
// @Dependencies: No dependencies on other tests
test('signIn', async ({ page }) => {
  console.log('[INFO] Executing Sign-in test...');
  await signIn(page);
  await expect(page).toHaveURL(/portal/);
  console.log('[INFO] Sign-in test completed successfully.');
});
