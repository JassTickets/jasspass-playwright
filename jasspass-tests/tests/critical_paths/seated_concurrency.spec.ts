import type { Page } from '@playwright/test';
import {
  test,
  expect,
  type CreatedEvent,
  type CreatedTicketType,
} from '../../fixtures/application';
import {
  assertOrderConfirmation,
  assertPurchaseSuccessUrl,
  createUniqueBuyer,
  fillGuestContact,
  getApiArray,
  openEvent,
  selectTicketQuantity,
  submitPurchase,
  waitForTransaction,
} from '../../helpers/criticalCheckoutHelpers';
import {
  numberedSeats,
  readSeatingAvailability,
  type HoldResponse,
  type SeatingMapDefinition,
} from '../../helpers/seatingHelpers';
import {
  expectSeatedInventory,
  purchaseAutoAssignedFreeTickets,
  type SeatedTicket,
  type SeatedTransaction,
} from '../../helpers/seatedCheckoutHelpers';

function concurrencyMap(
  ticketTypeId: string,
  seatCount: number
): SeatingMapDefinition {
  return {
    Sections: [
      {
        Name: 'Rush Floor',
        Code: 'RUSH',
        TicketTypeId: null,
        Rows: [
          {
            Label: 'A',
            Seats: numberedSeats(seatCount, ticketTypeId),
          },
        ],
      },
    ],
    SelectionRules: {
      NoOrphanSeats: false,
      AutoAssignSeats: true,
      Strategy: 0,
    },
  };
}

async function preparePairCheckout(
  page: Page,
  created: CreatedEvent,
  ticketType: CreatedTicketType
): Promise<void> {
  await openEvent(page, created.id, created.name);
  await selectTicketQuantity(page, created.id, ticketType.Type, 2);
  await expect(
    page.locator('[data-checkout-cta="true"]').first()
  ).toBeEnabled();
}

async function responseMessage(response: {
  text(): Promise<string>;
}): Promise<string> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { message?: string } | string;
    return typeof body === 'string' ? body : body.message ?? text;
  } catch {
    return text;
  }
}

test.describe('seated-event concurrency', () => {
  test.setTimeout(300_000);

  test('allows exactly one simultaneous buyer to purchase the last pair', async ({
    page,
    browser,
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [
        {
          type: 'Last Pair Reserved',
          price: 0,
          totalTickets: 2,
          maxTicketsPerPurchase: 2,
        },
      ],
      seatingMap: (event) => concurrencyMap(event.ticketTypes[0].Id, 2),
    });
    const ticketType = created.ticketTypes[0];
    const competingContext = await browser.newContext();
    const competingPage = await competingContext.newPage();
    try {
      await Promise.all([
        preparePairCheckout(page, created, ticketType),
        preparePairCheckout(competingPage, created, ticketType),
      ]);

      const pages = [page, competingPage];
      const responses = pages.map((buyerPage) =>
        buyerPage.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response
              .url()
              .includes(
                `/api/public/seating/${created.id}/hold/best-available/batch`
              ),
          { timeout: 30_000 }
        )
      );
      await Promise.all(
        pages.map((buyerPage) =>
          buyerPage.locator('[data-checkout-cta="true"]').first().click()
        )
      );
      const holdResponses = await Promise.all(responses);
      const holdBodies = await Promise.all(
        holdResponses.map((response) => response.text())
      );
      expect(
        holdResponses.map((response) => response.status()).sort(),
        `Concurrent hold responses: ${holdResponses
          .map(
            (response, index) =>
              `${response.status()} ${holdBodies[index]}`
          )
          .join(' | ')}`
      ).toEqual([200, 409]);

      const winnerIndex = holdResponses.findIndex((response) => response.ok());
      const loserIndex = winnerIndex === 0 ? 1 : 0;
      const winnerPage = pages[winnerIndex];
      const loserPage = pages[loserIndex];
      const winningHold = JSON.parse(holdBodies[winnerIndex]) as HoldResponse;
      const losingBody = JSON.parse(holdBodies[loserIndex]) as {
        message?: string;
      };
      const losingMessage = losingBody.message ?? holdBodies[loserIndex];
      expect(winningHold.SeatLabels).toHaveLength(2);
      expect(new Set(winningHold.SeatLabels).size).toBe(2);
      expect(losingMessage).toContain('does not have 2 seat(s) available');
      await expect(
        loserPage.getByText(/does not have 2 seat\(s\) available/).first()
      ).toBeVisible();
      await expect(
        winnerPage.getByRole('heading', {
          name: 'Order Summary',
          exact: true,
        })
      ).toBeVisible();

      const buyer = createUniqueBuyer('LastPairWinner');
      await fillGuestContact(winnerPage, buyer);
      const purchase = await submitPurchase(winnerPage, 'RSVP');
      await assertPurchaseSuccessUrl(
        winnerPage,
        created.id,
        purchase.Confirmation
      );
      await assertOrderConfirmation(
        winnerPage,
        created.name,
        purchase.Confirmation
      );
      const transaction = await waitForTransaction<SeatedTransaction>(
        ownerApi,
        created.id,
        purchase.Confirmation
      );
      expect(transaction).toMatchObject({
        Status: 'Complete',
        Quantity: 2,
        Email: buyer.email,
        SeatsIOHoldToken: winningHold.HoldToken,
      });
      const transactionSeats = transaction.Purchases.flatMap(
        (item) => item.Seats ?? []
      );
      expect(new Set(transactionSeats)).toEqual(
        new Set(winningHold.SeatLabels)
      );

      const [transactions, tickets] = await Promise.all([
        getApiArray<SeatedTransaction>(
          ownerApi.get(`/api/protected/events/${created.id}/transactions`),
          'Transactions'
        ),
        getApiArray<SeatedTicket>(
          ownerApi.get(`/api/protected/events/${created.id}/tickets`),
          'Tickets'
        ),
      ]);
      expect(transactions).toHaveLength(1);
      expect(tickets).toHaveLength(2);
      expect(new Set(transactionSeats).size).toBe(2);
      await expectSeatedInventory(ownerApi, created, ticketType.Id, {
        sold: 2,
        capacity: 2,
        bookedSeatLabels: winningHold.SeatLabels,
      });
    } finally {
      await competingContext.close();
    }
  });

  test('fills the map in sequential pairs and refuses the first order beyond capacity', async ({
    browser,
    eventFactory,
    ownerApi,
  }) => {
    const capacity = 6;
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [
        {
          type: 'Rush Reserved',
          price: 0,
          totalTickets: capacity,
          maxTicketsPerPurchase: 2,
        },
      ],
      seatingMap: (event) =>
        concurrencyMap(event.ticketTypes[0].Id, capacity),
    });
    const ticketType = created.ticketTypes[0];
    const everyAssignedSeat: string[] = [];

    for (let order = 0; order < capacity / 2; order += 1) {
      const context = await browser.newContext();
      const buyerPage = await context.newPage();
      try {
        const purchase = await purchaseAutoAssignedFreeTickets(
          buyerPage,
          ownerApi,
          created,
          ticketType,
          2,
          `RushPair${order + 1}`
        );
        everyAssignedSeat.push(...purchase.hold.SeatLabels);
        await expectSeatedInventory(ownerApi, created, ticketType.Id, {
          sold: (order + 1) * 2,
          capacity,
          bookedSeatLabels: everyAssignedSeat,
        });
      } finally {
        await context.close();
      }
    }

    expect(everyAssignedSeat).toHaveLength(capacity);
    expect(new Set(everyAssignedSeat).size).toBe(capacity);

    // Once sold out, the UI removes its quantity control. Calling the same public hold endpoint
    // verifies that a stale or tampered buyer is still rejected cleanly by the server.
    const exhaustedResponse = await ownerApi.post(
      `/api/public/seating/${created.id}/hold/best-available/batch`,
      {
        data: {
          Items: [{ TicketTypeId: ticketType.Id, Quantity: 2 }],
        },
      }
    );
    expect(exhaustedResponse.status()).toBe(409);
    expect(await responseMessage(exhaustedResponse)).toContain(
      'does not have 2 seat(s) available'
    );

    const [availability, transactions, tickets] = await Promise.all([
      readSeatingAvailability(ownerApi, created.id),
      getApiArray<SeatedTransaction>(
        ownerApi.get(`/api/protected/events/${created.id}/transactions`),
        'Transactions'
      ),
      getApiArray<SeatedTicket>(
        ownerApi.get(`/api/protected/events/${created.id}/tickets`),
        'Tickets'
      ),
    ]);
    expect(availability.Seats).toHaveLength(capacity);
    expect(
      availability.Seats.every((seat) => seat.Status === 'Booked')
    ).toBeTruthy();
    expect(transactions).toHaveLength(capacity / 2);
    expect(tickets).toHaveLength(capacity);
    await expectSeatedInventory(ownerApi, created, ticketType.Id, {
      sold: capacity,
      capacity,
      bookedSeatLabels: everyAssignedSeat,
    });
  });
});
