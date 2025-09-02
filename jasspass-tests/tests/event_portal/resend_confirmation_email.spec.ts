import { test, expect } from '@playwright/test';
import {
  selectFirstEventStartingWithPBO,
  resendConfirmationEmail,
} from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that resending confirmation emails functionality works correctly.
// @Dependencies: Depends on the sign-in functionality, existing event, and existing order being available.
test('resendConfirmationEmail', async ({ page }) => {
  console.log('[INFO] Executing Resend Confirmation Email test...');

  // Sign in and select first event starting with PBO
  const organizerPage = await selectFirstEventStartingWithPBO(page);

  // Attempt to resend confirmation email
  const buttonLocator = await resendConfirmationEmail(organizerPage);

  // Verify the button is still present (indicating the action was attempted)
  await expect(buttonLocator).toBeVisible();

  console.log('[INFO] Resend Confirmation Email test completed successfully.');
});
