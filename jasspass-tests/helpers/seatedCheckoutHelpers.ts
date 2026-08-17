import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { CreatedEvent, CreatedTicketType } from '../fixtures/application';
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
} from './criticalCheckoutHelpers';
import {
  expectSeatStatuses,
  readSeatingAvailability,
  type HoldResponse,
} from './seatingHelpers';

export type SeatedTransaction = {
  Confirmation: string;
  Status: string;
  Quantity: number;
  Email: string;
  SeatsIOHoldToken?: string | null;
  Purchases: Array<{
    TicketTypeId: string;
    Quantity: number;
    Seats?: string[];
  }>;
};

export type SeatedTicket = {
  Id: string;
  Confirmation: string;
  Status: string;
  TicketTypeId: string;
  Title: string;
  CapacityReleased?: boolean;
};

export async function purchaseAutoAssignedFreeTickets(
  page: Page,
  ownerApi: APIRequestContext,
  created: CreatedEvent,
  ticketType: CreatedTicketType,
  quantity: number,
  buyerLabel: string
): Promise<{
  hold: HoldResponse;
  confirmation: string;
  transaction: SeatedTransaction;
  tickets: SeatedTicket[];
}> {
  await openEvent(page, created.id, created.name);
  await expect(
    page.getByText('Select Your Seats', { exact: true })
  ).toHaveCount(0);
  await selectTicketQuantity(page, created.id, ticketType.Type, quantity);

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
  const holdBody = await holdResponse.text();
  expect(
    holdResponse.ok(),
    `Auto-assigned hold failed with ${holdResponse.status()}: ${holdBody}`
  ).toBeTruthy();
  const hold = JSON.parse(holdBody) as HoldResponse;
  expect(hold.SeatLabels).toHaveLength(quantity);
  expect(new Set(hold.SeatLabels).size).toBe(quantity);
  await expect(
    orderSummary.getByText(ticketType.Type, { exact: true })
  ).toBeVisible();
  await expect(
    orderSummary.getByText(`x${quantity}`, { exact: true })
  ).toBeVisible();

  const buyer = createUniqueBuyer(buyerLabel);
  await fillGuestContact(page, buyer);
  const purchase = await submitPurchase(page, 'RSVP');
  await assertPurchaseSuccessUrl(page, created.id, purchase.Confirmation);
  await assertOrderConfirmation(page, created.name, purchase.Confirmation);

  const transaction = await waitForTransaction<SeatedTransaction>(
    ownerApi,
    created.id,
    purchase.Confirmation
  );
  expect(transaction).toMatchObject({
    Status: 'Complete',
    Quantity: quantity,
    Email: buyer.email,
    SeatsIOHoldToken: hold.HoldToken,
  });
  const transactionPurchase = transaction.Purchases.find(
    (candidate) => candidate.TicketTypeId === ticketType.Id
  );
  expect(transactionPurchase).toMatchObject({
    TicketTypeId: ticketType.Id,
    Quantity: quantity,
  });
  expect(new Set(transactionPurchase?.Seats)).toEqual(new Set(hold.SeatLabels));

  const tickets = (
    await getApiArray<SeatedTicket>(
      ownerApi.get(`/api/protected/events/${created.id}/tickets`),
      'Tickets'
    )
  ).filter((ticket) => ticket.Confirmation === purchase.Confirmation);
  expect(tickets).toHaveLength(quantity);
  expect(
    tickets.every(
      (ticket) =>
        ticket.Status === 'Active' && ticket.TicketTypeId === ticketType.Id
    )
  ).toBeTruthy();
  for (const seatLabel of hold.SeatLabels) {
    expect(
      tickets.some((ticket) => ticket.Title.endsWith(` ${seatLabel}`)),
      `A ticket must be issued for assigned seat ${seatLabel}.`
    ).toBeTruthy();
  }
  await expectSeatStatuses(
    ownerApi,
    created.id,
    Object.fromEntries(
      hold.SeatLabels.map((seatLabel) => [seatLabel, 'Booked' as const])
    )
  );

  return {
    hold,
    confirmation: purchase.Confirmation,
    transaction,
    tickets,
  };
}

export async function expectSeatedInventory(
  ownerApi: APIRequestContext,
  created: CreatedEvent,
  ticketTypeId: string,
  expected: {
    sold: number;
    capacity: number;
    bookedSeatLabels?: string[];
  }
): Promise<void> {
  const [eventResponse, ticketTypes, tickets, availability] = await Promise.all(
    [
      ownerApi.get(`/api/public/events/${created.id}`),
      getApiArray<CreatedTicketType>(
        ownerApi.get(`/api/public/events/${created.id}/ticket-types`),
        'TicketTypes'
      ),
      getApiArray<SeatedTicket>(
        ownerApi.get(`/api/protected/events/${created.id}/tickets`),
        'Tickets'
      ),
      readSeatingAvailability(ownerApi, created.id),
    ]
  );
  const eventText = await eventResponse.text();
  expect(
    eventResponse.ok(),
    `Event inventory read failed with ${eventResponse.status()}: ${eventText}`
  ).toBeTruthy();
  const eventBody = JSON.parse(eventText) as {
    Event?: { TicketsSold?: Record<string, number> };
    TicketsSold?: Record<string, number>;
  };
  const event = eventBody.Event ?? eventBody;
  const ticketType = ticketTypes.find(
    (candidate) => candidate.Id === ticketTypeId
  );
  const activeTickets = tickets.filter(
    (ticket) =>
      ticket.TicketTypeId === ticketTypeId && ticket.Status === 'Active'
  );
  const bookedLabels = availability.Seats.filter(
    (seat) => seat.Status === 'Booked'
  ).map((seat) => seat.Label);

  expect(event.TicketsSold?.[ticketTypeId] ?? 0).toBe(expected.sold);
  expect(ticketType?.TotalTickets).toBe(expected.capacity);
  expect(activeTickets).toHaveLength(expected.sold);
  expect(bookedLabels).toHaveLength(expected.sold);
  expect(new Set(bookedLabels).size).toBe(bookedLabels.length);
  if (expected.bookedSeatLabels) {
    expect(new Set(bookedLabels)).toEqual(new Set(expected.bookedSeatLabels));
  }
}
