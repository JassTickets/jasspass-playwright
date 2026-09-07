import { test, expect } from '../../fixtures/kickback';
import { assertBrowserIdentity, closeProfilePrompt, json, ownProfile, promoterPath, purchase, uniqueBuyer, waitForAccount } from '../../helpers/kickbackHelpers';
import { JASS_TEST_URL, PLAYWRIGHT_BOT_EMAIL } from '../../constants';
import { getApiArray } from '../../helpers/criticalCheckoutHelpers';
import type { OrderTicket } from '../../helpers/kickbackHelpers';

test.describe('Checkout session boundaries', () => {
  test.setTimeout(150_000);

  test('[AC-04] already signed-in buyer keeps the existing session and skips guest account creation', async ({ ownerPage: page, kickbackEvent }) => {
    const event = await kickbackEvent();
    const before = await ownProfile(page.request); const accountRequests: string[] = [];
    page.on('request', r => { if (r.url().endsWith('/api/public/auth/post-checkout/account')) accountRequests.push(r.url()); });
    await purchase(page, event, { ...uniqueBuyer('SignedIn'), email: PLAYWRIGHT_BOT_EMAIL });
    await expect(page.getByText('Complete your profile', { exact: true })
      .or(page.getByText('Earn money by sharing this event', { exact: true }))).toBeVisible({ timeout: 30_000 });
    if (await page.getByText('Complete your profile', { exact: true }).isVisible()) await closeProfilePrompt(page);
    await expect(page.getByText('Earn money by sharing this event', { exact: true })).toBeVisible({ timeout: 30_000 });
    expect((await assertBrowserIdentity(page, PLAYWRIGHT_BOT_EMAIL)).Id).toBe(before.Id);
    expect(accountRequests).toEqual([]);
  });

  test('[AC-10] forwarded individual ticket never bootstraps the purchaser account', async ({ page, browser, ownerApi, kickbackEvent }) => {
    const event = await kickbackEvent({ isFreeEvent: true, tickets: [{ type: 'Free admission', price: 0 }] });
    const [_, order] = await Promise.all([waitForAccount(page), purchase(page, event, uniqueBuyer('Forwarded'), { free: true })]);
    const tickets = await getApiArray<OrderTicket>(ownerApi.get(`/api/protected/events/${event.id}/tickets`), 'Tickets');
    const ticket = tickets.find(t => t.Confirmation === order.Confirmation)!;
    expect(ticket).toBeDefined();
    const receiver = await browser.newContext({ baseURL: JASS_TEST_URL });
    try {
      const recipient = await receiver.newPage(); const accounts: string[] = [];
      recipient.on('request', r => { if (r.url().endsWith('/api/public/auth/post-checkout/account')) accounts.push(r.url()); });
      await recipient.goto(`${JASS_TEST_URL}/payment/success/${order.Confirmation}/${ticket.Id}`);
      await expect(recipient.getByText(order.Confirmation, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
      expect((await recipient.request.get('/api/protected/profile/me')).ok()).toBe(false);
      expect(accounts).toEqual([]);
    } finally { await receiver.close(); }
  });

  test('[PV-05] changing the proxy URL user ID cannot change the authenticated promoter identity', async ({ page, ownerIdentity, kickbackEvent }) => {
    const event = await kickbackEvent({ isFreeEvent: true, tickets: [{ type: 'Free admission', price: 0 }] });
    await Promise.all([waitForAccount(page), purchase(page, event, uniqueBuyer('ProxyScope'), { free: true })]);
    const user = await ownProfile(page.request);
    expect(user.Id).not.toBe(ownerIdentity.userId);
    const own = await json(await page.request.get(promoterPath(user.Id, '/profile')), 'Own promoter profile');
    const otherPath = await json(await page.request.get(promoterPath(ownerIdentity.userId, '/profile')), 'Altered proxy path');
    expect(otherPath).toEqual(own);
    const stats = await json<{ UserId: string; CurrencyTotals: unknown[] }>(
      await page.request.get(promoterPath(ownerIdentity.userId, '/stats')), 'Self-scoped proxy stats');
    expect(stats.UserId).toBe(user.Id); expect(stats.CurrencyTotals).toEqual([]);
  });
});
