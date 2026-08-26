import { test, expect } from '../../fixtures/application';
import type { APIRequestContext } from '@playwright/test';
import {
  assertOrderConfirmation,
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

type Transaction = {
  Id: string;
  Confirmation: string;
  Status: string;
  Quantity: number;
};

type Ticket = {
  Id: string;
  Confirmation: string;
  Status: string;
};

type Refund = {
  TransactionId: string;
  TicketIds: string[];
  Details: string;
  Complete: boolean;
};

async function submitOneTicketRefund(
  ownerApi: APIRequestContext,
  eventId: string,
  transactionId: string,
  ticketId: string,
  details: string,
): Promise<void> {
  const response = await ownerApi.post('/api/protected/refunds', {
    data: {
      eventId,
      transactionId,
      ticketIds: [ticketId],
      details,
      refundType: 0,
      includesServiceFee: false,
      includesOrganizerFee: false,
      includesTransactionFee: false,
      includesTax: false,
    },
  });
  const responseBody = await response.text().catch(() => '<unavailable>');
  expect(
    response.ok(),
    `Refund failed with ${response.status()}: ${responseBody}`
  ).toBeTruthy();
}

test.describe('partial-to-full refund lifecycle', () => {
  test.setTimeout(180_000);

  test('refunds one ticket at a time and persists partial then complete state', async ({
    page,
    ownerApi,
    eventFactory,
  }) => {
    const ticketName = 'Refundable Admission';
    const created = await eventFactory.create({
      tickets: [{ type: ticketName, price: 20 }],
      absorbServiceFees: true,
      absorbTransactionFees: true,
    });
    const buyer = createUniqueBuyer('PartialRefund');

    await openEvent(page, created.id, created.name);
    await selectTicketQuantity(page, created.id, ticketName, 2);
    await openCheckout(page);
    await fillGuestContact(page, buyer);
    const purchase = await submitStripeCheckout(page);
    await assertPurchaseSuccessUrl(page, created.id, purchase.Confirmation);
    await assertOrderConfirmation(page, created.name, purchase.Confirmation);

    const originalTransaction = await waitForTransaction<Transaction>(
      ownerApi,
      created.id,
      purchase.Confirmation
    );
    expect(originalTransaction).toMatchObject({
      Status: 'Complete',
      Quantity: 2,
    });

    const purchasedTickets = (
      await getApiArray<Ticket>(
        ownerApi.get(`/api/protected/events/${created.id}/tickets`),
        'Tickets'
      )
    ).filter((ticket) => ticket.Confirmation === purchase.Confirmation);
    expect(purchasedTickets).toHaveLength(2);
    const firstRefundTicketId = purchasedTickets[0].Id;
    await submitOneTicketRefund(
      ownerApi,
      created.id,
      originalTransaction.Id,
      firstRefundTicketId,
      'Playwright partial refund'
    );

    await expect
      .poll(
        async () =>
          (
            await waitForTransaction<Transaction>(
              ownerApi,
              created.id,
              purchase.Confirmation
            )
          ).Status,
        { timeout: 30_000, intervals: [500, 1_000, 2_000] }
      )
      .toBe('PartiallyRefunded');

    let ticketsAfterPartial: Ticket[] = [];
    await expect
      .poll(
        async () => {
          ticketsAfterPartial = (
            await getApiArray<Ticket>(
              ownerApi.get(`/api/protected/events/${created.id}/tickets`),
              'Tickets'
            )
          ).filter((ticket) => ticket.Confirmation === purchase.Confirmation);
          return ticketsAfterPartial.map((ticket) => ticket.Status).sort();
        },
        { timeout: 30_000, intervals: [500, 1_000, 2_000] }
      )
      .toEqual(['Active', 'RefundedBeforeEvent']);
    expect(
      ticketsAfterPartial.find((ticket) => ticket.Id === firstRefundTicketId)
    ).toMatchObject({ Status: 'RefundedBeforeEvent' });

    const secondRefundTicketId = ticketsAfterPartial.find(
      (ticket) => ticket.Status === 'Active'
    )!.Id;
    await submitOneTicketRefund(
      ownerApi,
      created.id,
      originalTransaction.Id,
      secondRefundTicketId,
      'Playwright final refund'
    );
    expect(secondRefundTicketId).not.toBe(firstRefundTicketId);

    await expect
      .poll(
        async () =>
          (
            await waitForTransaction<Transaction>(
              ownerApi,
              created.id,
              purchase.Confirmation
            )
          ).Status,
        { timeout: 30_000, intervals: [500, 1_000, 2_000] }
      )
      .toBe('CompletelyRefunded');

    let finalTickets: Ticket[] = [];
    await expect
      .poll(
        async () => {
          finalTickets = (
            await getApiArray<Ticket>(
              ownerApi.get(`/api/protected/events/${created.id}/tickets`),
              'Tickets'
            )
          ).filter((ticket) => ticket.Confirmation === purchase.Confirmation);
          return finalTickets.map((ticket) => ticket.Status).sort();
        },
        { timeout: 30_000, intervals: [500, 1_000, 2_000] }
      )
      .toEqual(['RefundedBeforeEvent', 'RefundedBeforeEvent']);
    expect(finalTickets).toHaveLength(2);
    expect(
      finalTickets.every((ticket) => ticket.Status === 'RefundedBeforeEvent')
    ).toBe(true);

    const refunds = (
      await getApiArray<Refund>(
        ownerApi.get(`/api/protected/events/${created.id}/refunds`),
        'Refunds'
      )
    ).filter((refund) => refund.TransactionId === originalTransaction.Id);
    expect(refunds).toHaveLength(2);
    expect(refunds.flatMap((refund) => refund.TicketIds).sort()).toEqual(
      [firstRefundTicketId, secondRefundTicketId].sort()
    );
    expect(refunds.map((refund) => refund.Details).sort()).toEqual([
      'Playwright final refund',
      'Playwright partial refund',
    ]);
  });
});
