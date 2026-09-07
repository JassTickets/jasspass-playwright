import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/application';
import {
  assertOrderConfirmation,
  assertPurchaseSuccessUrl,
  createUniqueBuyer,
  fillGuestContact,
  getApiArray,
  openCheckout,
  openEvent,
  selectTicketQuantity,
  submitPurchase,
  waitForTransaction,
} from '../../helpers/criticalCheckoutHelpers';
import {
  clickSeatAndWaitForHold,
  createAndPublishSeatingMap,
  expectSeatStatus,
  numberedSeats,
  type HoldResponse,
} from '../../helpers/seatingHelpers';

type TransactionPurchase = {
  TicketTypeId: string;
  Quantity: number;
  Seats?: string[];
};

type Transaction = {
  Confirmation: string;
  Status: string;
  Quantity: number;
  Email: string;
  SeatsIOHoldToken?: string | null;
  Purchases: TransactionPurchase[];
};

type Ticket = {
  Confirmation: string;
  Status: string;
  TicketTypeId: string;
  Title: string;
  Email?: string;
};

async function finishFreeSeatedCheckout(
  page: Page,
  eventId: string,
  eventName: string,
  buyerLabel: string
) {
  const orderSummary = await openCheckout(page);
  const buyer = createUniqueBuyer(buyerLabel);
  await fillGuestContact(page, buyer);
  const purchase = await submitPurchase(page, 'RSVP');
  await assertPurchaseSuccessUrl(page, eventId, purchase.Confirmation);
  await assertOrderConfirmation(page, eventName, purchase.Confirmation);
  return { orderSummary, buyer, purchase };
}

test.describe('seated-event checkout paths', () => {
  test.setTimeout(180_000);

  test('holds and purchases manually selected seats from multiple ticket tiers', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      hasSeatSelection: true,
      isFreeEvent: true,
      tickets: [
        { type: 'Seated VIP', price: 0, totalTickets: 2 },
        { type: 'Seated General', price: 0, totalTickets: 2 },
      ],
    });
    const vip = created.ticketTypes.find((ticket) => ticket.Type === 'Seated VIP')!;
    const general = created.ticketTypes.find(
      (ticket) => ticket.Type === 'Seated General'
    )!;

    const map = await createAndPublishSeatingMap(ownerApi, created, [
      {
        Name: 'VIP Floor',
        Code: 'V',
        TicketTypeId: vip.Id,
        Rows: [{ Label: 'A', Seats: numberedSeats(2) }],
      },
      {
        Name: 'General Floor',
        Code: 'G',
        TicketTypeId: general.Id,
        Rows: [{ Label: 'A', Seats: numberedSeats(2) }],
      },
    ]);
    if (map.SellableTicketTypeIds) {
      expect(new Set(map.SellableTicketTypeIds)).toEqual(
        new Set([vip.Id, general.Id])
      );
    }

    await openEvent(page, created.id, created.name);
    await expect(
      page.getByText('Select Your Seats', { exact: true }).first()
    ).toBeVisible({ timeout: 30_000 });

    const vipHold = await clickSeatAndWaitForHold(page, created.id, 'V-A1');
    expect(vipHold.response.status()).toBe(200);
    expect(vipHold.hold?.SeatLabels).toEqual(['V-A1']);
    if (vipHold.hold?.Seats) {
      expect(vipHold.hold.Seats).toEqual([
        { SeatLabel: 'V-A1', TicketTypeId: vip.Id },
      ]);
    }

    await page.getByRole('button', { name: /General Floor/ }).click();
    const generalHold = await clickSeatAndWaitForHold(
      page,
      created.id,
      'G-A1'
    );
    expect(generalHold.response.status()).toBe(200);
    expect(generalHold.hold?.HoldToken).toBe(vipHold.hold?.HoldToken);
    expect(generalHold.hold?.SeatLabels).toEqual(
      expect.arrayContaining(['V-A1', 'G-A1'])
    );
    if (generalHold.hold?.Seats) {
      expect(generalHold.hold.Seats).toEqual(
        expect.arrayContaining([
          { SeatLabel: 'V-A1', TicketTypeId: vip.Id },
          { SeatLabel: 'G-A1', TicketTypeId: general.Id },
        ])
      );
    }
    await expect(page.getByText('2 seats selected', { exact: true })).toBeVisible();

    const { buyer, purchase } = await finishFreeSeatedCheckout(
      page,
      created.id,
      created.name,
      'ManualSeating'
    );

    const transaction = await waitForTransaction<Transaction>(
      ownerApi,
      created.id,
      purchase.Confirmation
    );
    expect(transaction).toMatchObject({
      Status: 'Complete',
      Quantity: 2,
      Email: buyer.email,
      SeatsIOHoldToken: vipHold.hold?.HoldToken,
    });
    expect(transaction.Purchases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          TicketTypeId: vip.Id,
          Quantity: 1,
          Seats: ['V-A1'],
        }),
        expect.objectContaining({
          TicketTypeId: general.Id,
          Quantity: 1,
          Seats: ['G-A1'],
        }),
      ])
    );

    const tickets = await getApiArray<Ticket>(
      ownerApi.get(`/api/protected/events/${created.id}/tickets`),
      'Tickets'
    );
    const purchasedTickets = tickets.filter(
      (ticket) => ticket.Confirmation === purchase.Confirmation
    );
    expect(purchasedTickets).toHaveLength(2);
    expect(purchasedTickets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Status: 'Active',
          TicketTypeId: vip.Id,
          Title: expect.stringContaining('V-A1'),
        }),
        expect.objectContaining({
          Status: 'Active',
          TicketTypeId: general.Id,
          Title: expect.stringContaining('G-A1'),
        }),
      ])
    );
    await expectSeatStatus(ownerApi, created.id, 'V-A1', 'Booked');
    await expectSeatStatus(ownerApi, created.id, 'G-A1', 'Booked');
  });

  test('auto-assigns a multi-tier cart under one hold and persists the assigned seats', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      hasSeatSelection: true,
      isFreeEvent: true,
      purchaseLimit: 4,
      tickets: [
        {
          type: 'Auto VIP',
          price: 0,
          totalTickets: 8,
          maxTicketsPerPurchase: 4,
        },
        {
          type: 'Auto General',
          price: 0,
          totalTickets: 8,
          maxTicketsPerPurchase: 4,
        },
      ],
    });
    const vip = created.ticketTypes.find((ticket) => ticket.Type === 'Auto VIP')!;
    const general = created.ticketTypes.find(
      (ticket) => ticket.Type === 'Auto General'
    )!;

    await createAndPublishSeatingMap(
      ownerApi,
      created,
      [
        {
          Name: 'VIP Bowl',
          Code: 'V',
          TicketTypeId: vip.Id,
          Rows: [
            { Label: 'A', Seats: numberedSeats(4) },
            { Label: 'B', Seats: numberedSeats(4) },
          ],
        },
        {
          Name: 'General Bowl',
          Code: 'G',
          TicketTypeId: general.Id,
          Rows: [
            { Label: 'A', Seats: numberedSeats(4) },
            { Label: 'B', Seats: numberedSeats(4) },
          ],
        },
      ],
      {
        NoOrphanSeats: false,
        AutoAssignSeats: true,
        Strategy: 1,
      }
    );

    await openEvent(page, created.id, created.name);
    await expect(
      page.getByText('Select Your Seats', { exact: true })
    ).toHaveCount(0);
    await selectTicketQuantity(page, created.id, vip.Type, 2);
    await selectTicketQuantity(page, created.id, general.Type, 2);

    const holdResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response
          .url()
          .includes(
            `/api/public/seating/${created.id}/hold/best-available/batch`
          ),
      { timeout: 30_000 }
    );
    const orderSummary = await openCheckout(page);
    const holdResponse = await holdResponsePromise;
    expect(holdResponse.status()).toBe(200);
    const hold = (await holdResponse.json()) as HoldResponse;
    expect(hold.SeatLabels).toHaveLength(4);

    const vipSeats = hold.Seats
      ? hold.Seats.filter((seat) => seat.TicketTypeId === vip.Id).map(
          (seat) => seat.SeatLabel
        )
      : hold.SeatLabels.filter((label) => label.startsWith('V-'));
    const generalSeats = hold.Seats
      ? hold.Seats.filter((seat) => seat.TicketTypeId === general.Id).map(
          (seat) => seat.SeatLabel
        )
      : hold.SeatLabels.filter((label) => label.startsWith('G-'));
    expect(vipSeats).toHaveLength(2);
    expect(generalSeats).toHaveLength(2);
    expect(vipSeats.every((label) => label.startsWith('V-B'))).toBeTruthy();
    expect(
      generalSeats.every((label) => label.startsWith('G-B'))
    ).toBeTruthy();
    await expect(orderSummary).toContainText('Auto VIP');
    await expect(orderSummary).toContainText('Auto General');
    await expect(orderSummary.getByText('x2', { exact: true })).toHaveCount(2);

    const buyer = createUniqueBuyer('AutoSeating');
    await fillGuestContact(page, buyer);
    const purchase = await submitPurchase(page, 'RSVP');
    await assertPurchaseSuccessUrl(page, created.id, purchase.Confirmation);
    await assertOrderConfirmation(page, created.name, purchase.Confirmation);

    const transaction = await waitForTransaction<Transaction>(
      ownerApi,
      created.id,
      purchase.Confirmation
    );
    expect(transaction).toMatchObject({
      Status: 'Complete',
      Quantity: 4,
      Email: buyer.email,
      SeatsIOHoldToken: hold.HoldToken,
    });
    expect(transaction.Purchases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          TicketTypeId: vip.Id,
          Quantity: 2,
          Seats: expect.arrayContaining(vipSeats),
        }),
        expect.objectContaining({
          TicketTypeId: general.Id,
          Quantity: 2,
          Seats: expect.arrayContaining(generalSeats),
        }),
      ])
    );
    for (const seatLabel of hold.SeatLabels) {
      await expectSeatStatus(ownerApi, created.id, seatLabel, 'Booked');
    }
  });
});
