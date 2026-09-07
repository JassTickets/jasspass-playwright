import { type APIRequestContext } from '@playwright/test';
import { test, expect } from '../../fixtures/kickback';
import { type CreatedEvent } from '../../fixtures/application';
import { createMatrixOrganizer, stripeAccountIdFor, type MatrixCountry, type MatrixCurrency } from '../../helpers/countryCurrencyMatrixHelpers';
import { getApiArray } from '../../helpers/criticalCheckoutHelpers';
import { dismissDateOfBirthPromptIfPresent } from '../../helpers/auth';
import { assertBrowserIdentity, json, ownProfile, promoterPath, purchase, uniqueBuyer, uniqueCode,
  waitForAccount, type KickbackTransaction, type OrderTicket, type Promotion } from '../../helpers/kickbackHelpers';
import { JASS_TEST_URL } from '../../constants';

type LedgerPayment = {
  Id: string; TransactionId: string; EventId: string; CurrencyIso: string; AmountCents: number;
  GrossAmountCents: number; PlatformFeeCents: number; CollectedFundingCents: number;
  SettlementMode: string; AutomaticPayoutStatus: string; ReversedAmountCents: number;
  PspReferenceId: string | null; PayoutDestinationAccountId: string | null;
  WalletPayoutRequestedAtUtc: string | null;
};
type Settlement = {
  WalletAvailableNetCommissionCents: number; AutomaticPaidNetCommissionCents: number;
  AutomaticPendingNetCommissionCents: number; AutomaticFailedNetCommissionCents: number;
};
type CurrencyTotal = { CurrencyIso: string; SettlementSummary: Settlement };
const eventMarkets: [MatrixCountry, MatrixCurrency][] = [['US', 'USD'], ['CA', 'CAD'], ['ES', 'EUR']];

async function payments(api: APIRequestContext, path: string, promoterId: string, currency: string) {
  const result = await json<{ Items: LedgerPayment[] }>(
    await api.get(`${path}/${promoterId}/payments?currencyIso=${currency}`), 'Read real commission ledger');
  return result.Items;
}

async function totals(api: APIRequestContext, path: string): Promise<Record<string, Settlement>> {
  const stats = await json<{ CurrencyTotals: CurrencyTotal[] }>(await api.get(`${path}/stats`), 'Read real currency totals');
  return Object.fromEntries(stats.CurrencyTotals.map(row => [row.CurrencyIso.toUpperCase(), row.SettlementSummary]));
}

// Reusing a destination is fixture setup only: every sale, ledger and provider transfer
// below goes through testlab. Assertions use our transaction IDs, never a shared Stripe balance.
for (const accountCountry of ['US', 'CA', 'ES'] as const) {
  test(`[ST-04 WL-01 WL-02 WL-03 WL-06 WL-08 WL-09 WL-13 WL-15 MC-01 MC-02 MC-04 MC-05 MC-09] ${accountCountry} Stripe fixture pays new referrals and withdraws old USD/CAD/EUR wallets`,
    async ({ page, browser, ownerApi, ownerIdentity, kickbackEvent }, testInfo) => {
      test.setTimeout(900_000);
      // Fail visibly before creating paid fixtures if either application deployment is missing.
      const probe = await ownerApi.get(promoterPath(ownerIdentity.userId,
        `/testlab/stripe-connect/${ownerIdentity.organizerId}`));
      expect(probe.status(), 'Deploy the Kickback testlab fixture API and UI proxy before running settlement tests').toBe(200);
      expect(await probe.json()).toEqual({ Available: true });

      const buyer = uniqueBuyer(`Settlement${accountCountry}`);
      const bootstrap = await kickbackEvent({ isFreeEvent: true, tickets: [{ type: 'Fixture account', price: 0 }] });
      await Promise.all([waitForAccount(page), purchase(page, bootstrap, buyer, { free: true })]);
      const profile = await assertBrowserIdentity(page, buyer.email);
      const path = promoterPath(profile.Id);
      expect(await json(await page.request.get(`${path}/account/onboarded`), 'Read fresh account'))
        .toMatchObject({ HasAccount: false, Onboarded: false });

      // Source organizer belongs to this fresh user, matching the existing permission pattern.
      const source = await createMatrixOrganizer(page.request, profile.Id, accountCountry, stripeAccountIdFor(accountCountry));
      const attachPath = `${path}/testlab/stripe-connect/${source.organizerId}`;
      const events = new Map<MatrixCurrency, { event: CreatedEvent; promotion: Promotion; wallet: LedgerPayment; automatic?: LedgerPayment }>();
      let promoterId = '';

      const refer = async (event: CreatedEvent, code: string, currency: string, mode: 'Wallet' | 'AutomaticProviderPayout') => {
        const context = await browser.newContext({ baseURL: JASS_TEST_URL });
        let confirmation: string;
        try {
          const order = await purchase(await context.newPage(), event, uniqueBuyer(`Referral${currency}`), { promoCode: code });
          confirmation = order.Confirmation;
        } finally { await context.close(); }
        let transaction!: KickbackTransaction;
        await expect.poll(async () => {
          const rows = await getApiArray<KickbackTransaction>(ownerApi.get(`/api/protected/events/${event.id}/transactions`), 'Transactions');
          transaction = rows.find(row => row.Confirmation === confirmation)!;
          return transaction?.PromoterCommissionProcessingStatus;
        }, { timeout: 180_000, intervals: [1_000, 3_000, 5_000] }).toBe('Completed');
        expect(transaction).toMatchObject({ EventPromoterId: promoterId, PromoterAttributionType: 'BuyerAutoPromote',
          PromoterSettlementMode: mode, PromoterGrossCommissionCents: 100 });
        let payment!: LedgerPayment;
        await expect.poll(async () => {
          payment = (await payments(page.request, path, promoterId, currency)).find(row => row.TransactionId === transaction.Id)!;
          return mode === 'Wallet' ? payment?.SettlementMode : payment?.AutomaticPayoutStatus;
        }, { timeout: 180_000, intervals: [1_000, 3_000, 5_000] }).toBe(mode === 'Wallet' ? 'Wallet' : 'Paid');
        expect(payment).toMatchObject({ EventId: event.id, CurrencyIso: currency, SettlementMode: mode,
          AmountCents: transaction.PromoterNetCommissionCents, GrossAmountCents: 100, ReversedAmountCents: 0 });
        expect(payment.AmountCents).toBeGreaterThan(0);
        expect(payment.AmountCents + payment.PlatformFeeCents).toBe(100);
        expect(payment.CollectedFundingCents).toBeGreaterThanOrEqual(payment.GrossAmountCents);
        expect(payment.WalletPayoutRequestedAtUtc).toBeNull();
        if (mode === 'Wallet') expect(payment.PspReferenceId).toBeNull();
        else {
          expect(payment.PspReferenceId).toMatch(/^tr_/);
          expect(payment.PayoutDestinationAccountId).toBe(stripeAccountIdFor(accountCountry));
        }
        await testInfo.attach(`commission-${currency}-${mode}`, { contentType: 'application/json',
          body: JSON.stringify({ accountCountry, currency, eventId: event.id, transactionId: transaction.Id,
            paymentId: payment.Id, netCents: payment.AmountCents, transferId: payment.PspReferenceId }) });
        return payment;
      };

      for (const [country, currency] of eventMarkets) {
        const organizer = await createMatrixOrganizer(ownerApi, ownerIdentity.userId, country, stripeAccountIdFor(country));
        const event = await kickbackEvent({ organizer, eventCountryIso: country, currencyIso: currency });
        const order = await purchase(page, event, buyer);
        await expect.poll(async () => {
          const tickets = await getApiArray<OrderTicket>(ownerApi.get(`/api/protected/events/${event.id}/tickets`), 'Tickets');
          return tickets.some(t => t.Confirmation === order.Confirmation && t.UserId === profile.Id && t.Status === 'Active');
        }, { timeout: 30_000, intervals: [500, 1_000, 2_000] }).toBe(true);
        const promotion = await json<Promotion>(await page.request.post(`${path}/events/${event.id}/buyer-promotion`, {
          data: { Confirmation: order.Confirmation, Code: uniqueCode(), AcceptedTerms: true },
        }), 'Enroll fresh buyer');
        const identity = await json<{ EventPromoterId: string }>(await page.request.get(`${path}/profile`), 'Read promoter ID');
        if (promoterId) expect(identity.EventPromoterId).toBe(promoterId);
        promoterId = identity.EventPromoterId;
        const wallet = await refer(event, promotion.Code, currency, 'Wallet');
        events.set(currency, { event, promotion, wallet });
        expect((await page.request.post(`${path}/wallet/payouts?currencyIso=${currency}`)).status()).toBe(400);
      }

      const before = await totals(page.request, path);
      for (const [currency, { wallet }] of events) expect(before[currency]).toMatchObject({
        WalletAvailableNetCommissionCents: wallet.AmountCents, AutomaticPaidNetCommissionCents: 0 });
      // Caller cannot reuse an organizer it does not control, and failure leaves setup untouched.
      expect((await page.request.post(`${path}/testlab/stripe-connect/${ownerIdentity.organizerId}`)).status()).toBe(403);
      expect(await json(await page.request.get(`${path}/account/onboarded`), 'Read rejected setup')).toMatchObject({ HasAccount: false });
      for (let replay = 0; replay < 2; replay++) {
        expect(await json(await page.request.post(attachPath), 'Attach/replay existing test Stripe account'))
          .toMatchObject({ HasAccount: true, Onboarded: true, AccountCountryIso: accountCountry });
      }
      expect(await totals(page.request, path)).toEqual(before);
      const otherCountry = accountCountry === 'US' ? 'CA' : 'US';
      const otherSource = await createMatrixOrganizer(page.request, profile.Id, otherCountry, stripeAccountIdFor(otherCountry));
      expect((await page.request.post(`${path}/testlab/stripe-connect/${otherSource.organizerId}`)).status()).toBe(409);
      expect(await json(await page.request.get(`${path}/account/onboarded`), 'Read preserved destination'))
        .toMatchObject({ Onboarded: true, AccountCountryIso: accountCountry });

      for (const [currency, state] of events) {
        state.automatic = await refer(state.event, state.promotion.Code, currency, 'AutomaticProviderPayout');
        expect((await totals(page.request, path))[currency]).toMatchObject({
          WalletAvailableNetCommissionCents: state.wallet.AmountCents,
          AutomaticPaidNetCommissionCents: state.automatic.AmountCents,
          AutomaticPendingNetCommissionCents: 0, AutomaticFailedNetCommissionCents: 0,
        });
        expect((await payments(page.request, path, promoterId, currency)).find(p => p.Id === state.wallet.Id))
          .toMatchObject({ SettlementMode: 'Wallet', PspReferenceId: null, WalletPayoutRequestedAtUtc: null });
      }

      await page.goto(`${JASS_TEST_URL}/portal/promoter`);
      await dismissDateOfBirthPromptIfPresent(page);
      const walletCard = page.getByRole('region', { name: 'Wallet balance' });
      const withdrawn = new Set<string>();
      const transfers = new Set([...events.values()].map(row => row.automatic!.PspReferenceId));
      expect(transfers.size).toBe(3);
      for (const [currency, state] of events) {
        await page.getByRole('button', { name: currency, exact: true }).click();
        const amount = new Intl.NumberFormat('en', { style: 'currency', currency }).format(state.wallet.AmountCents / 100);
        const withdrawal = page.waitForResponse(r => r.request().method() === 'POST'
          && new URL(r.url()).pathname === `${path}/wallet/payouts`);
        await walletCard.getByRole('button', { name: `Withdraw ${amount}`, exact: true }).click();
        const response = await withdrawal;
        expect(response.status()).toBe(202);
        expect(new URL(response.url()).searchParams.get('currencyIso')).toBe(currency);
        expect(await response.json()).toMatchObject({ CurrencyIso: currency, AmountCents: state.wallet.AmountCents, CommissionCount: 1 });
        await expect(walletCard.getByRole('status')).toContainText('Withdrawal requested.');
        // An immediate duplicate cannot reserve or pay the same commission twice.
        expect((await page.request.post(`${path}/wallet/payouts?currencyIso=${currency}`)).status()).toBe(400);
        let paid!: LedgerPayment;
        await expect.poll(async () => {
          paid = (await payments(page.request, path, promoterId, currency)).find(p => p.Id === state.wallet.Id)!;
          return paid?.AutomaticPayoutStatus;
        }, { timeout: 180_000, intervals: [1_000, 3_000, 5_000] }).toBe('Paid');
        expect(paid).toMatchObject({ SettlementMode: 'AutomaticProviderPayout', AmountCents: state.wallet.AmountCents,
          PayoutDestinationAccountId: stripeAccountIdFor(accountCountry) });
        expect(paid.WalletPayoutRequestedAtUtc).toBeTruthy();
        expect(paid.PspReferenceId).toMatch(/^tr_/);
        expect(transfers.has(paid.PspReferenceId)).toBe(false);
        transfers.add(paid.PspReferenceId);
        withdrawn.add(currency);
        const current = await totals(page.request, path);
        for (const [otherCurrency, other] of events) expect(current[otherCurrency]).toMatchObject({
          WalletAvailableNetCommissionCents: withdrawn.has(otherCurrency) ? 0 : other.wallet.AmountCents,
          AutomaticPaidNetCommissionCents: other.automatic!.AmountCents + (withdrawn.has(otherCurrency) ? other.wallet.AmountCents : 0),
        });
        const currentPayments = await payments(page.request, path, promoterId, currency);
        expect(currentPayments).toHaveLength(2);
        expect(currentPayments.find(p => p.Id === state.automatic!.Id)?.PspReferenceId).toBe(state.automatic!.PspReferenceId);
        const transactions = await getApiArray<KickbackTransaction>(
          ownerApi.get(`/api/protected/events/${state.event.id}/transactions`), 'Transactions');
        expect(transactions.find(t => t.Id === state.wallet.TransactionId)).toMatchObject({
          PromoterSettlementMode: 'Wallet', PromoterNetCommissionCents: state.wallet.AmountCents,
          PromoterGrossCommissionCents: state.wallet.GrossAmountCents,
        });
      }
      expect(transfers.size).toBe(6);
      expect((await ownProfile(page.request)).Id).toBe(profile.Id);
      // The shared financial fixture refunds all sales and requires reversals/recovery.
    });
}
