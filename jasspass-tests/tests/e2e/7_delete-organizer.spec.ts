import { test, expect } from '@playwright/test';
import { createOrganizer } from '../../helpers/organizerHelpers';

test.setTimeout(180_000);

test('deleteOrganizer', async ({ page }) => {
  console.log('[INFO] Executing Delete Organizer test...');
  const organizerId = await createOrganizer(page);
  const deleted = await page.evaluate(async (id) => {
    const response = await fetch(`/api/protected/organizers/${id}`, {
      method: 'DELETE',
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    };
  }, organizerId);
  expect(
    deleted.ok,
    `Delete organizer failed: ${deleted.status} ${deleted.body}`
  ).toBe(true);
  console.log('[INFO] Delete Organizer test completed successfully.');
});
