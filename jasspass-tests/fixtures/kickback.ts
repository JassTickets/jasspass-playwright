import { test as application, expect, type CreateEventOptions, type CreatedEvent } from './application';
import { getApiArray } from '../helpers/criticalCheckoutHelpers';
import { json, type KickbackTransaction, type OrderTicket } from '../helpers/kickbackHelpers';

type KickbackFixtures = { kickbackEvent: (options?: CreateEventOptions) => Promise<CreatedEvent> };

export const test = application.extend<KickbackFixtures>({
  kickbackEvent: async ({ eventFactory, ownerApi }, use, testInfo) => {
    const events: CreatedEvent[] = [];
    await use(async (options = {}) => {
      const event = await eventFactory.create({
        name: `PW Kickback ${testInfo.testId.slice(-8)} ${Date.now()}`,
        tickets: [{ type: 'Kickback admission', price: 10 }],
        buyerPromotionSettings: { IsEnabled: true, Fee: { Percentage: 10, FixedAmount: 0 } },
        ...options, cleanup: false,
      });
      events.push(event);
      if (options.buyerPromotionSettings?.IsEnabled !== false) {
        expect(event.event.BuyerPromotionSettings).toMatchObject({ IsEnabled: true });
      }
      return event;
    });

    // Keep forensic identifiers even when setup/purchase fails. No passwords/tokens.
    await testInfo.attach('kickback-events', {
      body: JSON.stringify(events.map(e => ({ eventId: e.id, organizerId: e.organizerId }))),
      contentType: 'application/json',
    });
    const errors: string[] = [];
    for (const event of events.reverse()) {
      try {
        const transactions = await getApiArray<KickbackTransaction>(
          ownerApi.get(`/api/protected/events/${event.id}/transactions`), 'Transactions');
        const tickets = await getApiArray<OrderTicket>(
          ownerApi.get(`/api/protected/events/${event.id}/tickets`), 'Tickets');
        for (const transaction of transactions) {
          const active = tickets.filter(t => t.TransactionId === transaction.Id && t.Status === 'Active');
          if (!active.length) continue;
          if (transaction.EventPromoterId && transaction.PromoterNetCommissionCents > 0) {
            // Do not trigger the known refund-before-ledger race as an accidental teardown.
            await expect.poll(async () => {
              const fresh = await getApiArray<KickbackTransaction>(
                ownerApi.get(`/api/protected/events/${event.id}/transactions`), 'Transactions');
              return fresh.find(t => t.Id === transaction.Id)?.PromoterCommissionProcessingStatus;
            }, { timeout: 150_000, intervals: [1_000, 3_000, 5_000] }).toBe('Completed');
          }
          if (transaction.Amount > 0) {
            const refund = await ownerApi.post('/api/protected/refunds', { data: {
              eventId: event.id, transactionId: transaction.Id, ticketIds: active.map(t => t.Id),
              details: `Kickback test cleanup ${testInfo.testId}`, refundType: 'Online',
              includesServiceFee: true, includesOrganizerFee: true, includesTransactionFee: true, includesTax: true,
            } });
            expect(refund.ok(), `Cleanup refund ${transaction.Id}: HTTP ${refund.status()}`).toBeTruthy();
          } else {
            for (const ticket of active) {
              await json(await ownerApi.post('/api/protected/tickets/status', { data: {
                ticketId: ticket.Id, eventId: event.id, organizerId: event.organizerId, releaseSeatAndCapacity: true,
              } }), 'Cancel zero-total fixture ticket');
            }
          }
        }
        const promotersWithEarnings = new Set(transactions.filter(t => t.EventPromoterId && t.PromoterNetCommissionCents > 0)
          .map(t => t.EventPromoterId));
        if (promotersWithEarnings.size) {
          await expect.poll(async () => {
            const stats = await getApiArray<{
              EventPromoterId: string; TotalCommissionCents: number;
              SettlementSummary: { WalletAvailableNetCommissionCents: number; PayoutRecoveryOutstandingCents: number };
            }>(ownerApi.get(`/api/protected/organizers/${event.organizerId}/events/${event.id}/promoters/stats`), 'Stats');
            const relevant = stats.filter(row => promotersWithEarnings.has(row.EventPromoterId));
            return new Set(relevant.map(row => row.EventPromoterId)).size === promotersWithEarnings.size
              && relevant.every(row => row.TotalCommissionCents === 0
                && row.SettlementSummary.WalletAvailableNetCommissionCents === 0
                && row.SettlementSummary.PayoutRecoveryOutstandingCents === 0);
          }, { timeout: 60_000, intervals: [1_000, 3_000, 5_000] }).toBe(true);
        }
      } catch (error) { errors.push(`Event ${event.id} retained: ${String(error)}`); }
      // Hide fixtures even when money reconciliation fails, preserving all financial parents.
      try {
        const hide = await ownerApi.put(`/api/protected/events/${event.id}`, { multipart: {
          eventId: event.id, request: JSON.stringify({ IsVisible: false }),
        } });
        expect(hide.ok() || hide.status() === 304, `Hide fixture ${event.id}: HTTP ${hide.status()}`).toBeTruthy();
      } catch (error) { errors.push(`Event ${event.id} could not be hidden: ${String(error)}`); }
    }
    expect(errors, 'Financial cleanup must complete; retained event IDs are attached').toEqual([]);
  },
});
export { expect } from '@playwright/test';
