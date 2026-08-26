import { test, expect } from '../../fixtures/application';
import {
  assertPurchaseSuccessUrl,
  createUniqueBuyer,
  fillGuestContact,
  getApiArray,
  openCheckout,
  openEvent,
  selectTicketQuantity,
  submitStripeCheckout,
  waitForTransaction,
} from '../../helpers/criticalCheckoutHelpers';

test.setTimeout(180_000);

test('refundTicket', async ({ page, ownerApi, eventFactory }) => {
  console.log('[INFO] Executing Refund Ticket test...');
  const ticketName = 'General Admission Playwright';
  const created = await eventFactory.create({
    tickets: [{ type: ticketName, price: 55 }],
    absorbServiceFees: true,
    absorbTransactionFees: true,
  });
  await openEvent(page, created.id, created.name);
  await selectTicketQuantity(page, created.id, ticketName, 1);
  await openCheckout(page);
  await fillGuestContact(page, createUniqueBuyer('LegacyRefund'));
  const purchase = await submitStripeCheckout(page);
  await assertPurchaseSuccessUrl(page, created.id, purchase.Confirmation);

  const transaction = await waitForTransaction<{ Id: string; Status: string }>(
    ownerApi,
    created.id,
    purchase.Confirmation
  );
  let tickets: Array<{ Id: string; Confirmation: string }> = [];
  await expect
    .poll(
      async () => {
        tickets = (
          await getApiArray<{ Id: string; Confirmation: string }>(
            ownerApi.get(`/api/protected/events/${created.id}/tickets`),
            'Tickets'
          )
        ).filter((ticket) => ticket.Confirmation === purchase.Confirmation);
        return tickets.length;
      },
      { timeout: 30_000, intervals: [500, 1_000, 2_000] }
    )
    .toBe(1);
  expect(tickets).toHaveLength(1);

  const refundResponse = await ownerApi.post('/api/protected/refunds', {
    data: {
      eventId: created.id,
      transactionId: transaction.Id,
      ticketIds: [tickets[0].Id],
      details: 'Playwright Refund',
      refundType: 0,
      includesServiceFee: false,
      includesOrganizerFee: false,
      includesTransactionFee: false,
      includesTax: false,
    },
  });
  expect(refundResponse.ok()).toBe(true);
  await expect
    .poll(
      async () =>
        (
          await waitForTransaction<{ Status: string }>(
            ownerApi,
            created.id,
            purchase.Confirmation
          )
        ).Status,
      { timeout: 30_000 }
    )
    .toBe('CompletelyRefunded');
  console.log('[INFO] Refund Ticket test completed successfully.');
});
