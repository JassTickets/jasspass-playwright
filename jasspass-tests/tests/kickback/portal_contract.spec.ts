import { test, expect } from '../../fixtures/application';
import { portalContract } from '../../helpers/kickbackPortalContract';
import { JASS_TEST_URL } from '../../constants';

test.describe('Promoter portal UI contracts @ui-contract', () => {
  test.setTimeout(90_000);

  test('[WL-01 WL-02 WL-12 WL-14 MC-02 MC-06] currency-specific withdrawal locks duplicate actions and refreshes only the selected balance', async ({ ownerPage: page }) => {
    const state = await portalContract(page);
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    state.payout = async route => {
      await gate;
      state.currencies.USD.WalletAvailableNetCommissionCents = 0;
      state.currencies.USD.WalletNetCommissionCents = 0;
      state.currencies.USD.AutomaticPendingNetCommissionCents = 900;
      await route.fulfill({ status: 202, json: { CurrencyIso: 'USD', AmountCents: 900, CommissionCount: 1 } });
    };
    await page.goto(`${JASS_TEST_URL}/portal/promoter`);
    await page.getByRole('button', { name: 'USD', exact: true }).click();
    const wallet = page.getByRole('region', { name: 'Wallet balance' });
    try {
      await wallet.getByRole('button', { name: 'Withdraw $9.00', exact: true }).click();
      await expect(wallet.getByRole('button', { name: 'Requesting withdrawal…', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'CAD', exact: true })).toBeDisabled();
      expect(state.payouts).toEqual(['USD']);
    } finally { release(); }
    await expect(wallet.getByRole('status')).toContainText('Withdrawal requested.');
    await expect(wallet.getByText('Your payout is processing.', { exact: false })).toBeVisible();
    await expect(wallet.getByRole('button', { name: /^Withdraw/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'CAD', exact: true }).click();
    await expect(wallet.getByRole('button', { name: /^Withdraw.*12\.34$/ })).toBeVisible();
    await expect(wallet.getByRole('status')).toHaveCount(0);
    await page.getByRole('button', { name: 'EUR', exact: true }).click();
    await expect(wallet.getByRole('button', { name: /^Withdraw.*23\.45$/ })).toBeVisible();
  });

  test('[WL-15 WL-16] uncertain withdrawal refreshes state and reports an error without claiming payment', async ({ ownerPage: page }) => {
    const state = await portalContract(page);
    state.payout = route => route.fulfill({ status: 503, json: { message: 'Injected payout response failure' } });
    await page.goto(`${JASS_TEST_URL}/portal/promoter`);
    await page.getByRole('button', { name: 'USD', exact: true }).click();
    const wallet = page.getByRole('region', { name: 'Wallet balance' }); const before = state.statsRequests;
    await wallet.getByRole('button', { name: /^Withdraw/ }).click();
    await expect(wallet.getByRole('alert')).toContainText('We couldn’t confirm the withdrawal.');
    await expect.poll(() => state.statsRequests).toBeGreaterThan(before);
    await wallet.getByRole('button', { name: 'Check again', exact: true }).click();
    await expect.poll(() => state.statsRequests).toBeGreaterThan(before + 1);
    expect(state.payouts).toHaveLength(1);
  });

  test('[WL-17] failed balance refresh hides stale money and disables withdrawal until recovery', async ({ ownerPage: page }) => {
    const state = await portalContract(page);
    await page.goto(`${JASS_TEST_URL}/portal/promoter`);
    await page.getByRole('button', { name: 'USD', exact: true }).click();
    const wallet = page.getByRole('region', { name: 'Wallet balance' });
    await expect(wallet.getByRole('button', { name: /^Withdraw/ })).toBeVisible();
    state.statsError = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(wallet.getByText('We couldn’t update your balance. Please check again before withdrawing.', { exact: true })).toBeVisible();
    await expect(wallet.getByRole('button', { name: /^Withdraw/ })).toHaveCount(0);
    state.statsError = false;
    await wallet.getByRole('button', { name: 'Check again', exact: true }).click();
    await expect(wallet.getByRole('button', { name: 'Withdraw $9.00', exact: true })).toBeVisible();
  });

  for (const kind of ['empty', 'held', 'pending', 'needs-setup'] as const) {
    test(`[WL-01 WL-18] wallet presentation for ${kind}`, async ({ ownerPage: page }) => {
      const state = await portalContract(page);
      state.status.Onboarded = kind !== 'needs-setup';
      state.currencies.USD.WalletAvailableNetCommissionCents = kind === 'needs-setup' ? 900 : 0;
      state.currencies.USD.WalletNetCommissionCents = kind === 'held' || kind === 'needs-setup' ? 900 : 0;
      state.currencies.USD.AutomaticPendingNetCommissionCents = kind === 'pending' ? 900 : 0;
      await page.goto(`${JASS_TEST_URL}/portal/promoter`);
      await page.getByRole('button', { name: 'USD', exact: true }).click();
      const wallet = page.getByRole('region', { name: 'Wallet balance' });
      const descriptions = {
        empty: 'You have no wallet earnings available to withdraw.',
        held: 'Your saved earnings aren’t available to withdraw yet. Check Commission History for their status.',
        pending: 'Your payout is processing. Follow its progress in Commission History.',
        'needs-setup': 'Your earnings are saved. Connect Stripe to withdraw them whenever you’re ready.',
      };
      await expect(wallet.getByText(descriptions[kind], { exact: true })).toBeVisible();
      await expect(wallet.getByRole('button', { name: /^Withdraw/ })).toHaveCount(0);
      if (kind === 'needs-setup') await expect(wallet.getByRole('button', { name: 'Set up Stripe to withdraw', exact: true })).toBeVisible();
    });
  }

  for (const ready of [false, true]) {
    test(`[ST-11 ST-12] ${ready ? 'ready dashboard opens a separate tab' : 'incomplete onboarding continues in the same tab'}`, async ({ ownerPage: page }) => {
      const state = await portalContract(page); state.status.Onboarded = ready;
      await page.goto(`${JASS_TEST_URL}/portal/promoter`);
      if (ready) {
        const popupPromise = page.waitForEvent('popup');
        await page.getByRole('button', { name: 'Stripe Dashboard', exact: true }).click();
        const popup = await popupPromise;
        await expect(popup.getByRole('heading', { name: 'Controlled provider destination' })).toBeVisible();
        expect(await popup.evaluate(() => window.opener)).toBeNull();
        await expect(page).toHaveURL(/\/portal\/promoter$/); await popup.close();
      } else {
        await page.getByRole('button', { name: 'Set up payouts', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Controlled provider destination' })).toBeVisible();
      }
    });
  }

  test('[ST-03 ST-06 ST-13] empty country catalogue cannot start onboarding; failed creation preserves balances and supports recovery', async ({ ownerPage: page }) => {
    const state = await portalContract(page);
    state.status = { HasAccount: false, AccountCountryIso: null, Onboarded: false, CountrySelectionRequired: true, SupportedCountryIsos: [] };
    await page.goto(`${JASS_TEST_URL}/portal/promoter`);
    await page.getByRole('button', { name: 'Set up payouts', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continue to Stripe', exact: true })).toBeDisabled();
    await expect(page.getByRole('alert').filter({ hasText: 'Stripe onboarding is currently unavailable.' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    state.status.SupportedCountryIsos = ['US', 'CA', 'ES'];
    state.activate = route => route.fulfill({ status: 503, body: 'Unable to create the onboarding link.' });
    await page.getByRole('button', { name: 'Set up payouts', exact: true }).click();
    await page.getByLabel('Country of residence', { exact: true }).selectOption('ES');
    const request = page.waitForRequest(r => r.url().endsWith('/account/activate'));
    await page.getByRole('button', { name: 'Continue to Stripe', exact: true }).click();
    expect((await request).postDataJSON()).toEqual({ AccountCountryIso: 'ES' });
    await expect(page.getByRole('alert').filter({ hasText: 'Unable to create the onboarding link.' })).toBeVisible();
    expect(state.payouts).toHaveLength(0);
  });

  for (const malformed of ['ready-without-account', 'missing-country', 'duplicate-country', 'invalid-country'] as const) {
    test(`[ST-14] malformed onboarding status ${malformed} never enables payments`, async ({ ownerPage: page }) => {
      const state = await portalContract(page); let activations = 0;
      state.activate = async route => { activations++; await route.fulfill({ status: 500 }); };
      if (malformed === 'ready-without-account') state.status.HasAccount = false;
      if (malformed === 'missing-country') state.status.AccountCountryIso = null;
      if (malformed === 'duplicate-country') state.status.SupportedCountryIsos = ['US', 'US'];
      if (malformed === 'invalid-country') state.status.SupportedCountryIsos = ['USA'];
      await page.goto(`${JASS_TEST_URL}/portal/promoter`);
      await expect(page.getByRole('button', { name: 'Stripe Dashboard', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Set up payouts', exact: true }).click();
      await expect(page.getByText('Unable to open Stripe. Please try again.', { exact: true })).toBeVisible();
      expect(activations).toBe(0); expect(state.payouts).toEqual([]);
    });
  }

  test('[ST-16] returning from onboarding refreshes readiness while retaining the old wallet', async ({ ownerPage: page }) => {
    const state = await portalContract(page); state.status.Onboarded = false;
    await page.goto(`${JASS_TEST_URL}/portal/promoter`);
    await page.getByRole('button', { name: 'USD', exact: true }).click();
    const wallet = page.getByRole('region', { name: 'Wallet balance' });
    await expect(wallet.getByRole('button', { name: 'Set up Stripe to withdraw', exact: true })).toBeVisible();
    state.status.Onboarded = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(wallet.getByRole('button', { name: 'Withdraw $9.00', exact: true })).toBeVisible();
    expect(state.payouts).toEqual([]);
    state.status.Onboarded = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(wallet.getByRole('button', { name: 'Set up Stripe to withdraw', exact: true })).toBeVisible();
    expect(state.payouts).toEqual([]);
  });

  test('[PV-12] mobile wallet and country dialog keep controls visible and support Escape', async ({ ownerPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const state = await portalContract(page);
    state.status = { HasAccount: false, AccountCountryIso: null, Onboarded: false, CountrySelectionRequired: true,
      SupportedCountryIsos: ['US', 'CA', 'ES'] };
    await page.goto(`${JASS_TEST_URL}/portal/promoter`);
    await page.getByRole('button', { name: 'USD', exact: true }).click();
    const setup = page.getByRole('region', { name: 'Wallet balance' }).getByRole('button', { name: 'Set up Stripe to withdraw', exact: true });
    await setup.click();
    const country = page.getByLabel('Country of residence', { exact: true });
    await expect(country).toBeVisible(); await country.selectOption('ES');
    await expect(page.getByRole('button', { name: 'Continue to Stripe', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.keyboard.press('Escape'); await expect(country).toHaveCount(0);
  });
});
