import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/auth';

// @Description: This test verifies that the sign-in functionality works correctly.
// @Dependencies: No dependencies on other tests
test('signIn', async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/portal/);
});
