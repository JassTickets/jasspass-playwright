import { test, expect } from '../../fixtures/kickback';
import {
  assertBrowserIdentity, closeProfilePrompt, enrollThroughModal, json, promoterPath,
  uniqueBuyer, uniqueCode, purchaseWithAccount, type Promotion,
} from '../../helpers/kickbackHelpers';
import { JASS_TEST_URL, PLAYWRIGHT_BOT_EMAIL, PLAYWRIGHT_BOT_PASSWORD } from '../../constants';
import { dismissDateOfBirthPromptIfPresent } from '../../helpers/auth';

test.describe('Kickback enrollment lifecycle', () => {
  test.setTimeout(240_000);

  test('[KB-11 KB-15] submitted guest code resumes after password authentication', async ({ page, kickbackEvent }) => {
    const event = await kickbackEvent(); const code = uniqueCode();
    await purchaseWithAccount(page, event, { ...uniqueBuyer(), email: PLAYWRIGHT_BOT_EMAIL });
    await page.getByRole('button', { name: 'Continue without joining', exact: true }).click();
    await page.getByPlaceholder('YOUR-CODE').fill(code);
    await expect(page.getByText('This code is available.', { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('checkbox').filter({ visible: true }).check();
    await page.getByRole('button', { name: 'Create my code', exact: true }).click();
    await expect(page.getByLabel(/^Email\s*\*?$/i)).toHaveValue(PLAYWRIGHT_BOT_EMAIL);
    await page.getByLabel(/^Password\s*\*?$/i).fill(PLAYWRIGHT_BOT_PASSWORD);
    const enrollment = page.waitForResponse(r => r.request().method() === 'POST' && /\/buyer-promotion$/.test(new URL(r.url()).pathname));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // The shared test user may already have completed its optional profile.
    await expect(page.getByText('Complete your profile', { exact: true })
      .or(page.getByText('You’re now a promoter!', { exact: true }))).toBeVisible({ timeout: 30_000 });
    if (await page.getByText('Complete your profile', { exact: true }).isVisible()) await closeProfilePrompt(page);
    const response = await enrollment;
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toMatchObject({ Code: code, IsAlreadyPromoter: false, Status: 'Active' });
    await assertBrowserIdentity(page, PLAYWRIGHT_BOT_EMAIL);
    await expect(page.getByText(code, { exact: true })).toBeVisible();
  });

  test('[KB-18 KB-16 OR-04 PV-08] sharing, My Tickets deep link, revoke and reactivate preserve the same personal code', async ({ page, kickbackEvent, ownerApi, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const event = await kickbackEvent(); const buyer = uniqueBuyer('Sharing');
    await purchaseWithAccount(page, event, buyer);
    const profile = await assertBrowserIdentity(page, buyer.email);
    await closeProfilePrompt(page); const promotion = await enrollThroughModal(page);
    await page.getByRole('button', { name: 'Copy promo code', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(promotion.Code);
    await page.getByRole('button', { name: 'Copy personal link', exact: true }).click();
    const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    expect(link.searchParams.get('promoCode')).toBe(promotion.Code);
    await expect(page.getByRole('link', { name: 'Share on WhatsApp', exact: true })).toHaveAttribute('href', /wa\.me|whatsapp/);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.goto(`${JASS_TEST_URL}/portal/my-tickets?promote=${event.id}`);
    await expect(page.getByText(promotion.Code, { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page).not.toHaveURL(/promote=/);
    const statusPath = `/api/protected/organizers/${event.organizerId}/events/${event.id}/buyer-promotions/${promotion.EnrollmentId}`;
    expect((await ownerApi.post(`${statusPath}/revoke`)).ok()).toBe(true);
    expect(await json<Promotion>(await page.request.get(promoterPath(profile.Id, `/events/${event.id}/buyer-promotion`)), 'Read revoked promotion'))
      .toMatchObject({ Status: 'Revoked', Code: promotion.Code });
    expect((await ownerApi.post(`${statusPath}/reactivate`)).ok()).toBe(true);
    expect(await json<Promotion>(await page.request.get(promoterPath(profile.Id, `/events/${event.id}/buyer-promotion`)), 'Read restored promotion'))
      .toMatchObject({ Status: 'Active', Code: promotion.Code, EnrollmentId: promotion.EnrollmentId });
  });

  test('[ST-01 ST-05 ST-17] promoter and organizer expose the same countries and selecting one does not convert balances', async ({ page, kickbackEvent, ownerApi }) => {
    const event = await kickbackEvent(); const buyer = uniqueBuyer('Country');
    await purchaseWithAccount(page, event, buyer);
    const profile = await assertBrowserIdentity(page, buyer.email);
    await closeProfilePrompt(page); await enrollThroughModal(page);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    const organizer = await json<{ Countries: string[] }>(await ownerApi.get('/api/protected/stripe/onboarding-options'), 'Organizer countries');
    const promoter = await json<{ SupportedCountryIsos: string[]; HasAccount: boolean; CountrySelectionRequired: boolean }>(
      await page.request.get(promoterPath(profile.Id, '/account/onboarded')), 'Promoter countries');
    expect(promoter).toMatchObject({ HasAccount: false, CountrySelectionRequired: true });
    expect(promoter.SupportedCountryIsos.length).toBeGreaterThan(0);
    expect([...promoter.SupportedCountryIsos].sort()).toEqual([...organizer.Countries].sort());
    await page.goto(`${JASS_TEST_URL}/portal/promoter`);
    await dismissDateOfBirthPromptIfPresent(page);
    await page.getByRole('button', { name: 'Set up payouts', exact: true }).click();
    const select = page.getByLabel('Country of residence', { exact: true });
    await expect(select).toBeVisible();
    const options = await select.locator('option').evaluateAll(nodes => nodes.map(n => (n as HTMLOptionElement).value).filter(Boolean));
    expect(options.sort()).toEqual([...promoter.SupportedCountryIsos].sort());
    await expect(page.getByText('Your earnings stay in their original currencies. Selecting a country does not convert your wallet balance.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await json<{ HasAccount: boolean }>(await page.request.get(promoterPath(profile.Id, '/account/onboarded')), 'Cancelled setup')).HasAccount).toBe(false);
  });
});
