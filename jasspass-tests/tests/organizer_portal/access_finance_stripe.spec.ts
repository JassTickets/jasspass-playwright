import { expect } from '@playwright/test';
import { test } from '../../fixtures/application';

test.setTimeout(60_000);

// @Description: This test verifies that the access finance/Stripe dashboard functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing organizer being available.
test('accessFinanceStripe', async ({ ownerApi, ownerIdentity }) => {
  console.log('[INFO] Executing Access Finance Stripe test...');

  expect(ownerIdentity.hasActiveStripe).toBe(true);
  const stripeDashboardResponse = await ownerApi.get(
    `/api/protected/organizers/${ownerIdentity.organizerId}/account/express/dashboard`
  );
  expect(stripeDashboardResponse.ok()).toBe(true);
  const stripeDashboard = (await stripeDashboardResponse.json()) as {
    Url?: string;
  };
  expect(stripeDashboard.Url).toMatch(/^https:\/\/[^/]*stripe\.com\//);

  console.log('[INFO] Access Finance Stripe test completed successfully.');
});
