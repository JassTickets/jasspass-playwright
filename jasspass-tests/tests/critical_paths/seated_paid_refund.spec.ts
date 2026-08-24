import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/application';
import { JASS_TEST_URL } from '../../constants';
import { dismissDateOfBirthPromptIfPresent } from '../../helpers/auth';
import { openEventPortalDestination } from '../../helpers/portalNavigationHelpers';
import {
  assertOrderConfirmation,
  assertPurchaseSuccessUrl,
  createUniqueBuyer,
  fillGuestContact,
  getApiArray,
  openCheckout,
  openEvent,
  submitStripeCheckout,
  waitForTransaction,
} from '../../helpers/criticalCheckoutHelpers';
import {
  clickSeatAndWaitForHold,
  expectSeatStatuses,
  numberedSeats,
} from '../../helpers/seatingHelpers';
import type {
  SeatedTicket,
  SeatedTransaction,
} from '../../helpers/seatedCheckoutHelpers';

type Refund = {
  TransactionId: string;
  TicketIds: string[];
  Complete: boolean;
};

async function openOrder(ownerPage: Page, confirmation: string): Promise<void> {
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

async function refundSeat(
  ownerPage: Page,
  seatLabel: string,
  details: string
): Promise<string> {
  const ticketChoice = ownerPage
    .getByRole('heading', { name: 'Select Tickets to Refund' })
    .locator('..')
    .locator('label')
    .filter({ hasText: seatLabel });
  await expect(ticketChoice).toHaveCount(1);
  const ticketCheckbox = ticketChoice.locator('input[type="checkbox"]');
  await expect(ticketCheckbox).toBeEnabled();
  await expect(async () => {
    if (!(await ticketCheckbox.isChecked())) await ticketCheckbox.check();
    await expect(ticketCheckbox).toBeChecked();
  }).toPass({ timeout: 15_000 });
  await ownerPage.locator('#refund-details').fill(details);

  const responsePromise = ownerPage.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/protected/refunds'),
    { timeout: 45_000 }
  );
  const requestPromise = ownerPage.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().includes('/api/protected/refunds')
  );
  const submitRefund = ownerPage.getByRole('button', {
    name: 'Submit Refund',
    exact: true,
  });
  await expect(submitRefund).toBeEnabled({ timeout: 15_000 });
  await submitRefund.click();
  const [response, request] = await Promise.all([
    responsePromise,
    requestPromise,
  ]);
  const responseText = await response
    .text()
    .catch(() => '<response body unavailable>');
  expect(
    response.ok(),
    `Refund failed with ${response.status()}: ${responseText}`
  ).toBeTruthy();
  const body = request.postDataJSON() as { ticketIds: string[] };
  expect(body.ticketIds).toHaveLength(1);
  await expect(
    ownerPage.getByText('Refund submitted successfully.', { exact: true })
  ).toBeVisible({ timeout: 15_000 });
  return body.ticketIds[0];
}

test.describe('paid seated refund lifecycle', () => {
  test.setTimeout(300_000);

  test('releases each refunded seat independently and allows the released seat to be sold again', async ({
    page,
    browser,
    ownerPage,
    ownerApi,
    eventFactory,
  }) => {
    const created = await eventFactory.create({
      tickets: [
        {
          type: 'Refundable Reserved',
          price: 20,
          totalTickets: 2,
          maxTicketsPerPurchase: 2,
        },
      ],
      absorbServiceFees: true,
      absorbTransactionFees: true,
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Refund Floor',
            Code: 'REF',
            TicketTypeId: event.ticketTypes[0].Id,
            Rows: [{ Label: 'A', Seats: numberedSeats(2) }],
          },
        ],
        SelectionRules: { NoOrphanSeats: false, AutoAssignSeats: false },
      }),
    });

    await openEvent(page, created.id, created.name);
    for (const label of ['REF-A1', 'REF-A2']) {
      const held = await clickSeatAndWaitForHold(page, created.id, label);
      expect(held.response.ok()).toBeTruthy();
    }
    await openCheckout(page);
    await fillGuestContact(page, createUniqueBuyer('PaidSeatedRefund'));
    const purchase = await submitStripeCheckout(page);
    await assertPurchaseSuccessUrl(page, created.id, purchase.Confirmation);
    await assertOrderConfirmation(page, created.name, purchase.Confirmation);
    const transaction = await waitForTransaction<
      SeatedTransaction & { Id: string }
    >(ownerApi, created.id, purchase.Confirmation);
    expect(transaction).toMatchObject({ Status: 'Complete', Quantity: 2 });
    await expectSeatStatuses(ownerApi, created.id, {
      'REF-A1': 'Booked',
      'REF-A2': 'Booked',
    });

    await ownerPage.goto(
      `${JASS_TEST_URL}/portal/organizer/company/${created.organizerId}/event/${created.id}`
    );
    await dismissDateOfBirthPromptIfPresent(ownerPage, 10_000);
    await openEventPortalDestination(ownerPage, 'ordersAndAttendees');
    await openOrder(ownerPage, purchase.Confirmation);
    const firstRefundedId = await refundSeat(
      ownerPage,
      'REF-A1',
      'Release first reserved seat'
    );

    await expect
      .poll(
        async () =>
          (
            await waitForTransaction<SeatedTransaction>(
              ownerApi,
              created.id,
              purchase.Confirmation
            )
          ).Status,
        { timeout: 30_000, intervals: [500, 1_000, 2_000] }
      )
      .toBe('PartiallyRefunded');
    await expectSeatStatuses(ownerApi, created.id, {
      'REF-A1': 'Available',
      'REF-A2': 'Booked',
    });

    const replacementContext = await browser.newContext();
    let replacementConfirmation = '';
    try {
      const replacementPage = await replacementContext.newPage();
      await openEvent(replacementPage, created.id, created.name);
      const replacementHold = await clickSeatAndWaitForHold(
        replacementPage,
        created.id,
        'REF-A1'
      );
      expect(replacementHold.response.ok()).toBeTruthy();
      await openCheckout(replacementPage);
      await fillGuestContact(
        replacementPage,
        createUniqueBuyer('RefundSeatReplacement')
      );
      const replacement = await submitStripeCheckout(replacementPage);
      replacementConfirmation = replacement.Confirmation;
      await assertPurchaseSuccessUrl(
        replacementPage,
        created.id,
        replacementConfirmation
      );
    } finally {
      await replacementContext.close();
    }
    await expectSeatStatuses(ownerApi, created.id, {
      'REF-A1': 'Booked',
      'REF-A2': 'Booked',
    });

    await ownerPage.getByRole('button', { name: '✕' }).first().click();
    await openOrder(ownerPage, purchase.Confirmation);
    const secondRefundedId = await refundSeat(
      ownerPage,
      'REF-A2',
      'Release second reserved seat'
    );
    expect(secondRefundedId).not.toBe(firstRefundedId);

    await expect
      .poll(
        async () =>
          (
            await waitForTransaction<SeatedTransaction>(
              ownerApi,
              created.id,
              purchase.Confirmation
            )
          ).Status,
        { timeout: 30_000, intervals: [500, 1_000, 2_000] }
      )
      .toBe('CompletelyRefunded');
    await expectSeatStatuses(ownerApi, created.id, {
      'REF-A1': 'Booked',
      'REF-A2': 'Available',
    });

    const tickets = await getApiArray<SeatedTicket>(
      ownerApi.get(`/api/protected/events/${created.id}/tickets`),
      'Tickets'
    );
    expect(
      tickets
        .filter((ticket) => ticket.Confirmation === purchase.Confirmation)
        .map((ticket) => ticket.Status)
        .sort()
    ).toEqual(['RefundedBeforeEvent', 'RefundedBeforeEvent']);
    expect(
      tickets.find((ticket) => ticket.Confirmation === replacementConfirmation)
    ).toMatchObject({
      Status: 'Active',
      Title: expect.stringContaining('REF-A1'),
    });

    const refunds = (
      await getApiArray<Refund>(
        ownerApi.get(`/api/protected/events/${created.id}/refunds`),
        'Refunds'
      )
    ).filter((refund) => refund.TransactionId === transaction.Id);
    expect(refunds.flatMap((refund) => refund.TicketIds).sort()).toEqual(
      [firstRefundedId, secondRefundedId].sort()
    );
  });
});
