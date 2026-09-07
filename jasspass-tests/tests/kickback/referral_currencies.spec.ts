import { test, expect } from '../../fixtures/kickback';
import { assertBrowserIdentity, closeProfilePrompt, enrollThroughModal, json, promoterPath,
  purchase, uniqueBuyer, uniqueCode, purchaseWithAccount, type Promotion, type KickbackTransaction, type OrderTicket } from '../../helpers/kickbackHelpers';
import { createMatrixOrganizer, stripeAccountIdFor, type MatrixCountry, type MatrixCurrency } from '../../helpers/countryCurrencyMatrixHelpers';
import { getApiArray } from '../../helpers/criticalCheckoutHelpers';
import { dismissDateOfBirthPromptIfPresent } from '../../helpers/auth';
import { JASS_TEST_URL } from '../../constants';

type LedgerPayment = {
  Id: string; TransactionId: string; AmountCents: number; ReversedAmountCents: number;
  SettlementMode: string; AutomaticPayoutStatus: string; CurrencyIso: string; RiskStatus: string;
};

test('[MC-01 MC-02 CM-01 RF-01 NT-08] one real promoter earns USD, CAD and EUR wallets from testlab referral checkouts', async ({ page, browser, ownerApi, ownerIdentity, kickbackEvent }, testInfo) => {
  test.setTimeout(540_000);
  const buyer = uniqueBuyer('Multicurrency');
  const expected = new Map<string, number>();
  let profile: { Id: string } | undefined; let promoterId = '';
  const cases: [MatrixCountry, MatrixCurrency][] = [['US', 'USD'], ['CA', 'CAD'], ['ES', 'EUR']];
  for (const [country, currency] of cases) {
    const organizer = await createMatrixOrganizer(ownerApi, ownerIdentity.userId, country, stripeAccountIdFor(country));
    await testInfo.attach(`organizer-${country}`, { contentType: 'application/json', body: JSON.stringify({ organizerId: organizer.organizerId, country, currency }) });
    const event = await kickbackEvent({ organizer, eventCountryIso: country, currencyIso: currency });
    let promotion: Promotion;
    if (!profile) {
      await purchaseWithAccount(page, event, buyer);
      profile = await assertBrowserIdentity(page, buyer.email);
      await closeProfilePrompt(page); promotion = await enrollThroughModal(page);
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await page.evaluate(() => sessionStorage.setItem('dobPromptDismissed', '1'));
    } else {
      const order = await purchase(page, event, buyer);
      await expect.poll(async () => {
        const tickets = await getApiArray<OrderTicket>(ownerApi.get(`/api/protected/events/${event.id}/tickets`), 'Tickets');
        return tickets.some(ticket => ticket.Confirmation === order.Confirmation && ticket.UserId === profile!.Id && ticket.Status === 'Active');
      }, { timeout: 30_000, intervals: [500, 1_000, 2_000] }).toBe(true);
      promotion = await json<Promotion>(await page.request.post(promoterPath(profile.Id, `/events/${event.id}/buyer-promotion`),
        { data: { Confirmation: order.Confirmation, Code: uniqueCode(), AcceptedTerms: true } }), 'Enroll the same promoter on another event');
    }
    const promoter = await json<{ EventPromoterId: string }>(await page.request.get(promoterPath(profile.Id, '/profile')), 'Read promoter identity');
    if (promoterId) expect(promoter.EventPromoterId).toBe(promoterId);
    promoterId = promoter.EventPromoterId;
    const referralContext = await browser.newContext({ baseURL: JASS_TEST_URL });
    let confirmation = '';
    try {
      const referralPage = await referralContext.newPage();
      const order = await purchase(referralPage, event, uniqueBuyer(`Referral${currency}`), { promoCode: promotion.Code });
      confirmation = order.Confirmation;
    } finally { await referralContext.close(); }
    let transaction!: KickbackTransaction;
    await expect.poll(async () => {
      const rows = await getApiArray<KickbackTransaction>(ownerApi.get(`/api/protected/events/${event.id}/transactions`), 'Transactions');
      transaction = rows.find(row => row.Confirmation === confirmation)!;
      return transaction?.PromoterCommissionProcessingStatus;
    }, { timeout: 150_000, intervals: [1_000, 3_000, 5_000] }).toBe('Completed');
    expect(transaction).toMatchObject({ EventPromoterId: promoterId, PromoterAttributionType: 'BuyerAutoPromote',
      PromoterSettlementMode: 'Wallet', PromoterGrossCommissionCents: 100 });
    expect(transaction.PromoterNetCommissionCents).toBeGreaterThan(0);
    expect(transaction.PromoterNetCommissionCents + transaction.PromoterPlatformFeeCents).toBe(100);
    expected.set(currency, transaction.PromoterNetCommissionCents);
    const payments = await json<{ Items: LedgerPayment[] }>(
      await page.request.get(promoterPath(profile.Id, `/${promoterId}/payments?currencyIso=${currency}`)), 'Read referral ledger');
    expect(payments.Items).toHaveLength(1);
    expect(payments.Items[0]).toMatchObject({ TransactionId: transaction.Id, AmountCents: transaction.PromoterNetCommissionCents,
      SettlementMode: 'Wallet', ReversedAmountCents: 0, RiskStatus: 'Clear' });
    await testInfo.attach(`commission-${currency}`, { contentType: 'application/json', body: JSON.stringify({
      eventId: event.id, transactionId: transaction.Id, paymentId: payments.Items[0].Id, currency,
      grossCents: transaction.PromoterGrossCommissionCents, feeCents: transaction.PromoterPlatformFeeCents,
      netCents: transaction.PromoterNetCommissionCents,
    }) });
  }
  await page.goto(`${JASS_TEST_URL}/portal/promoter`);
  await dismissDateOfBirthPromptIfPresent(page);
  const wallet = page.getByRole('region', { name: 'Wallet balance' });
  for (const [currency, cents] of expected) {
    await page.getByRole('button', { name: currency, exact: true }).click();
    await expect(wallet.getByText(currency, { exact: true })).toBeVisible();
    await expect(wallet.getByRole('button', { name: 'Set up Stripe to withdraw', exact: true })).toBeVisible();
    await expect(wallet.getByText(new Intl.NumberFormat('en', { style: 'currency', currency }).format(cents / 100), { exact: true })).toBeVisible();
  }
  // The financial fixture refunds every sale after its commission exists, preserving
  // organizer/event/order IDs. It never deletes a parent of an unresolved commission.
});
