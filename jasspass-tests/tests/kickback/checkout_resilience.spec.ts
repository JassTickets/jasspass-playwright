import { test, expect } from '../../fixtures/kickback';
import {
  assertBrowserIdentity, closeProfilePrompt, json, promoterPath, purchase, uniqueBuyer, waitForAccount,
} from '../../helpers/kickbackHelpers';
import { PLAYWRIGHT_BOT_EMAIL } from '../../constants';

const accountRoute = '**/api/public/auth/post-checkout/account';

test.describe('Checkout account recovery', () => {
  test.setTimeout(180_000);

  for (const failure of [404, 408, 409, 425, 429, 500, 'network'] as const) {
    test(`[AC-07] account bootstrap recovers after ${failure}`, async ({ page, kickbackEvent }) => {
      const event = await kickbackEvent({ isFreeEvent: true, tickets: [{ type: 'Free admission', price: 0 }] });
      const buyer = uniqueBuyer('Retry'); let requests = 0;
      await page.route(accountRoute, async route => {
        requests++;
        if (requests > 1) return route.continue();
        if (failure === 'network') return route.abort('connectionfailed');
        await route.fulfill({ status: failure, json: { message: 'Injected transient account error' } });
      });
      await purchase(page, event, buyer, { free: true });
      await expect.poll(async () => (await page.request.get('/api/protected/profile/me')).ok(), { timeout: 30_000 }).toBe(true);
      await assertBrowserIdentity(page, buyer.email);
      expect(requests).toBe(2);
      await expect(page.getByText('Save your tickets to your account', { exact: true })).toBeHidden();
    });
  }

  for (const failure of [400, 503]) {
    test(`[AC-08] account error ${failure} preserves tickets and supports an explicit retry`, async ({ page, kickbackEvent }) => {
      const event = await kickbackEvent({ isFreeEvent: true, tickets: [{ type: 'Free admission', price: 0 }] });
      const buyer = uniqueBuyer('Recovery'); let requests = 0;
      await page.route(accountRoute, route => { requests++; return route.fulfill({ status: failure, json: { message: 'Injected account error' } }); });
      const order = await purchase(page, event, buyer, { free: true });
      await expect(page.getByText('We couldn’t finish setting up your account', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(order.Confirmation, { exact: true }).first()).toBeVisible();
      expect(requests).toBe(failure === 400 ? 1 : 4);
      await expect(page.getByText('Save your tickets to your account', { exact: true })).toBeHidden();
      await page.unroute(accountRoute);
      const account = waitForAccount(page);
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      expect((await account).Status).toBe('Created');
      await assertBrowserIdentity(page, buyer.email);
    });
  }

  test('[AC-09 KB-15] declining sign-in leaves tickets accessible and does not enroll', async ({ page, kickbackEvent }) => {
    const event = await kickbackEvent();
    const buyer = { ...uniqueBuyer('Decline'), email: PLAYWRIGHT_BOT_EMAIL };
    await Promise.all([waitForAccount(page), purchase(page, event, buyer)]);
    await page.getByRole('button', { name: 'Continue without joining', exact: true }).click();
    await expect(page.getByText('Earn money by sharing this event', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Not now', exact: true }).click();
    await expect(page.getByText('Order Confirmed!', { exact: true })).toBeVisible();
    expect((await page.request.get('/api/protected/profile/me')).ok()).toBe(false);
  });
});
