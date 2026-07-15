import { test, expect } from '../../fixtures/application';
import type { Page } from '@playwright/test';
import { JASS_TEST_URL } from '../../constants';
import {
  assertOrderConfirmation,
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

async function openOrder(
  ownerPage: Page,
  confirmation: string
) {
  const search = ownerPage.getByRole('textbox', { name: 'Search Orders' });
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill(confirmation);
  const row = ownerPage
    .getByRole('table')
    .getByRole('row')
    .filter({ hasText: confirmation })
    .first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expect(
    ownerPage.getByRole('heading', { name: 'Process Refund' })
  ).toBeVisible({ timeout: 30_000 });
}

async function submitOneTicketRefund(
  ownerPage: Page,
  details: string,
  expectedSelectableTickets: number
): Promise<string> {
  const selection = ownerPage
    .getByRole('heading', { name: 'Select Tickets to Refund' })
    .locator('..');
  const enabledTicketCheckboxes = selection.locator(
    'input[type="checkbox"]:not(:disabled)'
  );
  await expect(enabledTicketCheckboxes).toHaveCount(expectedSelectableTickets);
  await enabledTicketCheckboxes.first().check();
  await ownerPage.locator('#refund-details').fill(details);

  const refundResponsePromise = ownerPage.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/protected/refunds'),
    { timeout: 45_000 }
  );
  const refundRequestPromise = ownerPage.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().includes('/api/protected/refunds')
  );
  await ownerPage
    .getByRole('button', { name: 'Submit Refund', exact: true })
    .click();
  const [refundResponse, refundRequest] = await Promise.all([
    refundResponsePromise,
    refundRequestPromise,
  ]);
  const responseBody = await refundResponse.text();
  expect(
    refundResponse.ok(),
    `Refund failed with ${refundResponse.status()}: ${responseBody}`
  ).toBeTruthy();
  const requestBody = refundRequest.postDataJSON() as {
    ticketIds: string[];
    details: string;
  };
  expect(requestBody.ticketIds).toHaveLength(1);
  expect(requestBody.details).toBe(details);
  await expect(
    ownerPage.getByText('Refund submitted successfully.', { exact: true })
  ).toBeVisible({ timeout: 15_000 });
  return requestBody.ticketIds[0];
}

test.describe('partial-to-full refund lifecycle', () => {
  test.setTimeout(180_000);

  test('refunds one ticket at a time and persists partial then complete state', async ({
    page,
    ownerPage,
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
    await assertOrderConfirmation(
      page,
      created.name,
      purchase.Confirmation
    );

    const originalTransaction = await waitForTransaction<Transaction>(
      ownerApi,
      created.id,
      purchase.Confirmation
    );
    expect(originalTransaction).toMatchObject({
      Status: 'Complete',
      Quantity: 2,
    });

    await ownerPage.goto(
      `${JASS_TEST_URL}/portal/organizer/company/${created.organizerId}/event/${created.id}`
    );
    await expect(
      ownerPage.getByRole('button', { name: 'Orders & Attendees' }).first()
    ).toBeVisible({ timeout: 30_000 });
    await ownerPage
      .getByRole('button', { name: 'Orders & Attendees' })
      .first()
      .click();

    await openOrder(ownerPage, purchase.Confirmation);
    const firstRefundTicketId = await submitOneTicketRefund(
      ownerPage,
      'Playwright partial refund',
      2
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
          ).filter(
            (ticket) => ticket.Confirmation === purchase.Confirmation
          );
          return ticketsAfterPartial.map((ticket) => ticket.Status).sort();
        },
        { timeout: 30_000, intervals: [500, 1_000, 2_000] }
      )
      .toEqual(['Active', 'RefundedBeforeEvent']);
    expect(
      ticketsAfterPartial.find((ticket) => ticket.Id === firstRefundTicketId)
    ).toMatchObject({ Status: 'RefundedBeforeEvent' });

    await ownerPage.getByRole('button', { name: '✕' }).first().click();
    await openOrder(ownerPage, purchase.Confirmation);
    const secondRefundTicketId = await submitOneTicketRefund(
      ownerPage,
      'Playwright final refund',
      1
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
          ).filter(
            (ticket) => ticket.Confirmation === purchase.Confirmation
          );
          return finalTickets.map((ticket) => ticket.Status).sort();
        },
        { timeout: 30_000, intervals: [500, 1_000, 2_000] }
      )
      .toEqual(['RefundedBeforeEvent', 'RefundedBeforeEvent']);
    expect(finalTickets).toHaveLength(2);
    expect(
      finalTickets.every(
        (ticket) => ticket.Status === 'RefundedBeforeEvent'
      )
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
