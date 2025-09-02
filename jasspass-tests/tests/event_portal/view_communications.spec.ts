import { test, expect } from '@playwright/test';
import { selectFirstEventStartingWithPBO } from '../../helpers/eventHelpers';

test.setTimeout(60_000);

// @Description: This test verifies that viewing event communications functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('viewEventCommunications', async ({ page }) => {
  console.log('[INFO] Executing View Event Communications test...');

  // Sign in and select first event starting with PBO
  const organizerPage = await selectFirstEventStartingWithPBO(page);

  // Navigate to Communications tab
  await organizerPage.getByRole('link', { name: 'Communications' }).click();

  // Verify we can access the communications section
  const communicationsSection = organizerPage.locator('div').filter({
    hasText: /^Message AttendeesCommunications CenterMessage Attendees$/,
  });

  await expect(communicationsSection).toBeVisible();

  // Try clicking on communications center elements (if they exist)
  const communicationsCenterIcon = communicationsSection
    .getByRole('img')
    .nth(1);

  await communicationsCenterIcon.click();

  console.log('[INFO] View Event Communications test completed successfully.');
});
