import { test, expect } from '../../fixtures/application';
import { getApiArray } from '../../helpers/criticalCheckoutHelpers';
import {
  blockSeats,
  expectSeatStatuses,
  numberedSeats,
  readSeatingAvailability,
  type SeatingMapDefinition,
} from '../../helpers/seatingHelpers';
import {
  expectSeatedInventory,
  purchaseAutoAssignedFreeTickets,
} from '../../helpers/seatedCheckoutHelpers';

function autoAssignedRow(
  ticketTypeId: string,
  seatCount: number
): SeatingMapDefinition {
  return {
    Sections: [
      {
        Name: 'Main Floor',
        Code: 'MAIN',
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

function rowSeatLabel(number: string | number): string {
  return `MAIN-A${number}`;
}

function expectOneConsecutiveRun(labels: string[]): void {
  expect(labels.length).toBeGreaterThan(0);
  const rowPrefixes = new Set(labels.map((label) => label.replace(/\d+$/, '')));
  expect(rowPrefixes.size).toBe(1);
  const numbers = labels
    .map((label) => Number(label.match(/(\d+)$/)?.[1]))
    .sort((left, right) => left - right);
  expect(numbers.every(Number.isFinite)).toBeTruthy();
  expect(
    numbers.slice(1).every((number, index) => number === numbers[index] + 1)
  ).toBeTruthy();
}

async function responseMessage(response: {
  text(): Promise<string>;
}): Promise<string> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { message?: string };
    return body.message ?? text;
  } catch {
    return text;
  }
}

test.describe('seated group booking', () => {
  test.setTimeout(240_000);

  test('keeps an auto-assigned group together when a full row run is available', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      isFreeEvent: true,
      purchaseLimit: 10,
      tickets: [
        {
          type: 'Together Reserved',
          price: 0,
          totalTickets: 10,
          maxTicketsPerPurchase: 10,
        },
      ],
      seatingMap: (event) => autoAssignedRow(event.ticketTypes[0].Id, 10),
    });
    const ticketType = created.ticketTypes[0];

    const purchase = await purchaseAutoAssignedFreeTickets(
      page,
      ownerApi,
      created,
      ticketType,
      4,
      'TogetherGroup'
    );

    expectOneConsecutiveRun(purchase.hold.SeatLabels);
    await expectSeatedInventory(ownerApi, created, ticketType.Id, {
      sold: 4,
      capacity: 10,
      bookedSeatLabels: purchase.hold.SeatLabels,
    });
  });

  test('assigns identical seats for identical fresh events', async ({
    page,
    browser,
    eventFactory,
    ownerApi,
  }) => {
    const createDeterministicEvent = () =>
      eventFactory.create({
        isFreeEvent: true,
        tickets: [
          {
            type: 'Deterministic Reserved',
            price: 0,
            totalTickets: 10,
            maxTicketsPerPurchase: 10,
          },
        ],
        seatingMap: (event) => autoAssignedRow(event.ticketTypes[0].Id, 10),
      });
    const [firstEvent, secondEvent] = await Promise.all([
      createDeterministicEvent(),
      createDeterministicEvent(),
    ]);
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    try {
      const [firstPurchase, secondPurchase] = await Promise.all([
        purchaseAutoAssignedFreeTickets(
          page,
          ownerApi,
          firstEvent,
          firstEvent.ticketTypes[0],
          2,
          'DeterministicOne'
        ),
        purchaseAutoAssignedFreeTickets(
          secondPage,
          ownerApi,
          secondEvent,
          secondEvent.ticketTypes[0],
          2,
          'DeterministicTwo'
        ),
      ]);

      expect(firstPurchase.hold.SeatLabels).toEqual(
        secondPurchase.hold.SeatLabels
      );
      await Promise.all([
        expectSeatedInventory(
          ownerApi,
          firstEvent,
          firstEvent.ticketTypes[0].Id,
          {
            sold: 2,
            capacity: 10,
            bookedSeatLabels: firstPurchase.hold.SeatLabels,
          }
        ),
        expectSeatedInventory(
          ownerApi,
          secondEvent,
          secondEvent.ticketTypes[0].Id,
          {
            sold: 2,
            capacity: 10,
            bookedSeatLabels: secondPurchase.hold.SeatLabels,
          }
        ),
      ]);
    } finally {
      await secondContext.close();
    }
  });

  test('splits a party around a blocked seat and never sells the block', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [
        {
          type: 'Split Reserved',
          price: 0,
          totalTickets: 5,
          maxTicketsPerPurchase: 5,
        },
      ],
      seatingMap: (event) => autoAssignedRow(event.ticketTypes[0].Id, 5),
    });
    const ticketType = created.ticketTypes[0];
    const blockedLabel = rowSeatLabel(3);
    expect(await blockSeats(ownerApi, created, [blockedLabel])).toEqual([
      blockedLabel,
    ]);

    const purchase = await purchaseAutoAssignedFreeTickets(
      page,
      ownerApi,
      created,
      ticketType,
      4,
      'SplitFour'
    );
    const expectedSoldSeats = [1, 2, 4, 5].map(rowSeatLabel);

    expect(new Set(purchase.hold.SeatLabels)).toEqual(
      new Set(expectedSoldSeats)
    );
    expect(purchase.hold.SeatLabels).not.toContain(blockedLabel);
    await expectSeatStatuses(ownerApi, created.id, {
      ...Object.fromEntries(
        expectedSoldSeats.map((label) => [label, 'Booked' as const])
      ),
      [blockedLabel]: 'Blocked',
    });
    await expectSeatedInventory(ownerApi, created, ticketType.Id, {
      sold: 4,
      capacity: 5,
      bookedSeatLabels: expectedSoldSeats,
    });
  });

  test('uses the largest available runs when a party must split', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [
        {
          type: 'Largest Runs Reserved',
          price: 0,
          totalTickets: 6,
          maxTicketsPerPurchase: 6,
        },
      ],
      seatingMap: (event) => autoAssignedRow(event.ticketTypes[0].Id, 6),
    });
    const ticketType = created.ticketTypes[0];
    const blockedLabel = rowSeatLabel(4);
    await blockSeats(ownerApi, created, [blockedLabel]);

    const purchase = await purchaseAutoAssignedFreeTickets(
      page,
      ownerApi,
      created,
      ticketType,
      5,
      'LargestRuns'
    );
    const threeSeatRun = [1, 2, 3].map(rowSeatLabel);
    const twoSeatRun = [5, 6].map(rowSeatLabel);

    expect(purchase.hold.SeatLabels).toEqual([
      ...threeSeatRun,
      ...twoSeatRun,
    ]);
    await expectSeatedInventory(ownerApi, created, ticketType.Id, {
      sold: 5,
      capacity: 6,
      bookedSeatLabels: [...threeSeatRun, ...twoSeatRun],
    });
  });

  test('rejects a genuine shortage without holding or booking anything', async ({
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [
        {
          type: 'Shortage Reserved',
          price: 0,
          totalTickets: 3,
          maxTicketsPerPurchase: 4,
        },
      ],
      seatingMap: (event) => autoAssignedRow(event.ticketTypes[0].Id, 3),
    });
    const ticketType = created.ticketTypes[0];

    // The sold-out-aware quantity picker cannot select above live capacity, so exercise the
    // same public endpoint that the auto-assignment UI calls and verify its atomic result.
    const response = await ownerApi.post(
      `/api/public/seating/${created.id}/hold/best-available/batch`,
      {
        data: {
          Items: [{ TicketTypeId: ticketType.Id, Quantity: 4 }],
        },
      }
    );
    expect(response.status()).toBe(409);
    expect(await responseMessage(response)).toContain(
      "does not have 4 seat(s) available"
    );

    const availability = await readSeatingAvailability(ownerApi, created.id);
    expect(availability.Seats).toHaveLength(3);
    expect(
      availability.Seats.every((seat) => seat.Status === 'Available')
    ).toBeTruthy();
    expect(
      await getApiArray(
        ownerApi.get(`/api/protected/events/${created.id}/transactions`),
        'Transactions'
      )
    ).toEqual([]);
    await expectSeatedInventory(ownerApi, created, ticketType.Id, {
      sold: 0,
      capacity: 3,
      bookedSeatLabels: [],
    });
  });
});
