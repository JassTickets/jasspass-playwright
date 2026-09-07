import { test, expect } from '../../fixtures/kickback';
import {
  assertBrowserIdentity, closeProfilePrompt, enrollThroughModal, json, promoterPath,
  purchase, revisitConfirmation, uniqueBuyer, waitForAccount, type Promotion,
} from '../../helpers/kickbackHelpers';
import { getApiArray } from '../../helpers/criticalCheckoutHelpers';
import { JASS_TEST_URL, PLAYWRIGHT_BOT_EMAIL, PLAYWRIGHT_BOT_PASSWORD } from '../../constants';

test.describe('Kickback checkout identity', () => {
  test.setTimeout(240_000);

  test('[AC-01 AC-05 AC-14 AC-16 KB-01 KB-04] new guest becomes the ticket owner and enrolls once', async ({ page, kickbackEvent, ownerApi }) => {
    const event = await kickbackEvent();
    const buyer = uniqueBuyer();
    const [account, order] = await Promise.all([waitForAccount(page), purchase(page, event, buyer)]);
    expect(account.Status).toBe('Created');
    const profile = await assertBrowserIdentity(page, buyer.email);
    await closeProfilePrompt(page);
    const promotion = await enrollThroughModal(page);
    const persisted = await json<Promotion>(await page.request.get(
      promoterPath(profile.Id, `/events/${event.id}/buyer-promotion`)), 'Read enrolled promotion');
    expect(persisted).toMatchObject({ EnrollmentId: promotion.EnrollmentId, Code: promotion.Code, IsAlreadyPromoter: true });
    const tickets = await getApiArray<{ Confirmation: string; UserId: string }>(
      ownerApi.get(`/api/protected/events/${event.id}/tickets`), 'Tickets');
    expect(tickets.filter(t => t.Confirmation === order.Confirmation)).toEqual([
      expect.objectContaining({ UserId: profile.Id }),
    ]);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.reload();
    await assertBrowserIdentity(page, buyer.email);
    expect((await json<Promotion>(await page.request.get(
      promoterPath(profile.Id, `/events/${event.id}/buyer-promotion`)), 'Re-read enrolled promotion')).EnrollmentId)
      .toBe(promotion.EnrollmentId);
  });

  test('[AC-02 AC-18] existing guest keeps an anonymous session until matching password sign-in', async ({ page, kickbackEvent }) => {
    const event = await kickbackEvent();
    const buyer = { ...uniqueBuyer('Existing'), email: PLAYWRIGHT_BOT_EMAIL };
    const [account] = await Promise.all([waitForAccount(page), purchase(page, event, buyer)]);
    expect(account).toMatchObject({ Status: 'ExistingAccount', Email: buyer.email });
    expect(account.LoginData).toBeFalsy();
    expect((await page.request.get('/api/protected/profile/me')).ok()).toBe(false);
    await expect(page.getByText('Save your tickets to your account', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Yes, sign in', exact: true }).click();
    const email = page.getByLabel(/^Email\s*\*?$/i);
    await expect(email).toHaveValue(buyer.email);
    await expect(email).toHaveAttribute('readonly', '');
    await page.getByLabel(/^Password\s*\*?$/i).fill('wrong-password');
    const wrongLogin = page.waitForResponse(r => r.url().endsWith('/api/public/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    expect((await wrongLogin).ok()).toBe(false);
    expect((await page.request.get('/api/protected/profile/me')).ok()).toBe(false);
    await page.getByLabel(/^Password\s*\*?$/i).fill(PLAYWRIGHT_BOT_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect.poll(async () => (await page.request.get('/api/protected/profile/me')).ok()).toBe(true);
    await assertBrowserIdentity(page, buyer.email);
  });

  test('[AC-12 KB-03] zero-total guest gets an account but no paid-ticket promotion eligibility', async ({ page, kickbackEvent }) => {
    const event = await kickbackEvent({ isFreeEvent: true, tickets: [{ type: 'Free admission', price: 0 }] });
    const buyer = uniqueBuyer('Free');
    const [account, order] = await Promise.all([waitForAccount(page), purchase(page, event, buyer, { free: true })]);
    expect(account.Status).toBe('Created');
    const profile = await assertBrowserIdentity(page, buyer.email);
    const eligibility = await json<{ Status: string; CanEnroll: boolean }>(await page.request.get(
      promoterPath(profile.Id, `/events/${event.id}/buyer-promotion/eligibility?confirmation=${order.Confirmation}`)), 'Read free ticket eligibility');
    expect(eligibility).toMatchObject({ Status: 'NoQualifyingTicket', CanEnroll: false });
    await closeProfilePrompt(page);
    await expect(page.getByText('Order Confirmed!', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('YOUR-CODE')).toBeHidden();
  });
});
