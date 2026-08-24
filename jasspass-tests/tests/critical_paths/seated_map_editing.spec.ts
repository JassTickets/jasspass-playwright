import { test, expect } from '../../fixtures/application';
import {
  openEvent,
  selectTicketQuantity,
  visibleTicketPicker,
} from '../../helpers/criticalCheckoutHelpers';
import {
  expectSeatStatuses,
  numberedSeats,
  readPublicSeatingMap,
  updatePublishedSeatingMap,
  type SeatingMapDefinition,
  type SeatingMapResponse,
} from '../../helpers/seatingHelpers';
import {
  expectSeatedInventory,
  purchaseAutoAssignedFreeTickets,
} from '../../helpers/seatedCheckoutHelpers';

const SECTION_CODE = 'EDIT';
const ROW_LABEL = 'A';

function editableMap(
  ticketTypeId: string,
  seatNumbers: string[],
  options: {
    noOrphanSeats?: boolean;
    unassignedNumbers?: Set<string>;
  } = {}
): SeatingMapDefinition {
  return {
    Sections: [
      {
        Name: 'Editable Floor',
        Code: SECTION_CODE,
        TicketTypeId: null,
        Rows: [
          {
            Label: ROW_LABEL,
            Seats: seatNumbers.map((number) => ({
              Number: number,
              TicketTypeId: options.unassignedNumbers?.has(number)
                ? null
                : ticketTypeId,
            })),
          },
        ],
      },
    ],
    SelectionRules: {
      NoOrphanSeats: options.noOrphanSeats ?? false,
      AutoAssignSeats: true,
      Strategy: 0,
    },
  };
}

function seatLabel(number: string): string {
  return `${SECTION_CODE}-${ROW_LABEL}${number}`;
}

function seatNumber(map: SeatingMapResponse, label: string): string {
  for (const section of map.Sections) {
    for (const row of section.Rows) {
      const seat = row.Seats.find((candidate) => candidate.Label === label);
      if (seat) return seat.Number;
    }
  }
  throw new Error(`Seat ${label} was not found in the map.`);
}

async function errorMessage(response: {
  text(): Promise<string>;
}): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { message?: string } | string;
    return typeof parsed === 'string' ? parsed : parsed.message ?? text;
  } catch {
    return text;
  }
}

test.describe('published seating-map editing', () => {
  test.setTimeout(240_000);

  test('removes an unsold seat from sale but preserves a booked seat', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const initialNumbers = numberedSeats(4).map((seat) => seat.Number);
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [
        {
          type: 'Editable Reserved',
          price: 0,
          totalTickets: 4,
          maxTicketsPerPurchase: 4,
        },
      ],
      seatingMap: (event) =>
        editableMap(event.ticketTypes[0].Id, initialNumbers),
    });
    const ticketType = created.ticketTypes[0];
    const initialMap = await readPublicSeatingMap(ownerApi, created.id);
    expect(
      initialMap.Sections[0].Rows[0].Seats.every(
        (seat) => seat.EffectiveTicketTypeId === ticketType.Id
      )
    ).toBeTruthy();

    const purchase = await purchaseAutoAssignedFreeTickets(
      page,
      ownerApi,
      created,
      ticketType,
      1,
      'UnassignSeat'
    );
    const bookedLabel = purchase.hold.SeatLabels[0];
    const targetLabel = initialMap.Sections[0].Rows[0].Seats.find(
      (seat) => seat.Label !== bookedLabel
    )!.Label;
    const targetNumber = seatNumber(initialMap, targetLabel);

    await updatePublishedSeatingMap(
      ownerApi,
      created,
      editableMap(ticketType.Id, initialNumbers, {
        unassignedNumbers: new Set([targetNumber]),
      })
    );

    const updatedMap = await readPublicSeatingMap(ownerApi, created.id);
    const unassignedSeat = updatedMap.Sections[0].Rows[0].Seats.find(
      (seat) => seat.Label === targetLabel
    );
    expect(unassignedSeat?.EffectiveTicketTypeId ?? null).toBeNull();

    const directHold = await ownerApi.post(
      `/api/public/seating/${created.id}/hold/add`,
      {
        data: {
          HoldToken: null,
          TicketTypeId: ticketType.Id,
          SeatLabel: targetLabel,
        },
      }
    );
    expect(directHold.status()).toBe(400);
    expect(await errorMessage(directHold)).toContain(
      'is in an unassigned section and cannot be purchased'
    );

    const bookedNumber = seatNumber(updatedMap, bookedLabel);
    const stripBookedResponse = await ownerApi.put(
      `/api/protected/organizers/${created.organizerId}/events/${created.id}/seating-map`,
      {
        data: editableMap(ticketType.Id, initialNumbers, {
          unassignedNumbers: new Set([targetNumber, bookedNumber]),
        }),
      }
    );
    expect(stripBookedResponse.status()).toBe(409);
    expect(await errorMessage(stripBookedResponse)).toContain(
      `Cannot change the ticket type of seat [${bookedLabel}]`
    );

    const preservedMap = await readPublicSeatingMap(ownerApi, created.id);
    const preservedBookedSeat = preservedMap.Sections[0].Rows[0].Seats.find(
      (seat) => seat.Label === bookedLabel
    );
    expect(preservedBookedSeat?.EffectiveTicketTypeId).toBe(ticketType.Id);
    await expectSeatStatuses(ownerApi, created.id, {
      [bookedLabel]: 'Booked',
    });
    await expectSeatedInventory(ownerApi, created, ticketType.Id, {
      sold: 1,
      capacity: 3,
      bookedSeatLabels: [bookedLabel],
    });
  });

  test('inserts a seat without corrupting bookings or orphan-seat ordering', async ({
    page,
    browser,
    eventFactory,
    ownerApi,
  }) => {
    const initialNumbers = numberedSeats(4).map((seat) => seat.Number);
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [
        {
          type: 'Ordered Reserved',
          price: 0,
          totalTickets: 4,
          maxTicketsPerPurchase: 4,
        },
      ],
      seatingMap: (event) =>
        editableMap(event.ticketTypes[0].Id, initialNumbers, {
          noOrphanSeats: true,
        }),
    });
    const ticketType = created.ticketTypes[0];
    const purchase = await purchaseAutoAssignedFreeTickets(
      page,
      ownerApi,
      created,
      ticketType,
      2,
      'MapInsertion'
    );
    const bookedLabels = purchase.hold.SeatLabels;
    const insertedNumber = '2B';
    const insertedLabel = seatLabel(insertedNumber);
    const editedNumbers = ['1', '2', insertedNumber, '3', '4'];

    await updatePublishedSeatingMap(
      ownerApi,
      created,
      editableMap(ticketType.Id, editedNumbers, { noOrphanSeats: true })
    );

    const updatedMap = await readPublicSeatingMap(ownerApi, created.id);
    expect(
      updatedMap.Sections[0].Rows[0].Seats.map((seat) => seat.Number)
    ).toEqual(editedNumbers);
    for (const bookedLabel of bookedLabels) {
      expect(
        updatedMap.Sections[0].Rows[0].Seats.some(
          (seat) => seat.Label === bookedLabel
        )
      ).toBeTruthy();
    }
    await expectSeatStatuses(ownerApi, created.id, {
      ...Object.fromEntries(
        bookedLabels.map((label) => [label, 'Booked' as const])
      ),
      [insertedLabel]: 'Available',
    });
    await expectSeatedInventory(ownerApi, created, ticketType.Id, {
      sold: 2,
      capacity: 5,
      bookedSeatLabels: bookedLabels,
    });

    const buyerContext = await browser.newContext();
    const buyerPage = await buyerContext.newPage();
    try {
      await openEvent(buyerPage, created.id, created.name);
      await selectTicketQuantity(buyerPage, created.id, ticketType.Type, 2);
      const rejectedHoldPromise = buyerPage.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response
            .url()
            .includes(
              `/api/public/seating/${created.id}/hold/best-available/batch`
            ),
        { timeout: 30_000 }
      );
      await visibleTicketPicker(buyerPage)
        .locator('[data-checkout-cta="true"]')
        .filter({ visible: true })
        .first()
        .click();
      const rejectedHold = await rejectedHoldPromise;
      expect(rejectedHold.status()).toBe(409);
      expect(await errorMessage(rejectedHold)).toContain(
        'does not have 2 seat(s) available'
      );
      await expect(
        buyerPage.getByText(/does not have 2 seat\(s\) available/).first()
      ).toBeVisible();
    } finally {
      await buyerContext.close();
    }

    const afterRejectedHold = await readPublicSeatingMap(ownerApi, created.id);
    const bookedToRename = bookedLabels[0];
    const bookedNumber = seatNumber(afterRejectedHold, bookedToRename);
    const renamedNumbers = editedNumbers.map((number) =>
      number === bookedNumber ? `${number}X` : number
    );
    const renameResponse = await ownerApi.put(
      `/api/protected/organizers/${created.organizerId}/events/${created.id}/seating-map`,
      {
        data: editableMap(ticketType.Id, renamedNumbers, {
          noOrphanSeats: true,
        }),
      }
    );
    expect(renameResponse.status()).toBe(409);
    const renameError = await errorMessage(renameResponse);
    expect(renameError).toContain(
      'Cannot remove or rename seat(s) that have already been purchased'
    );
    expect(renameError).toContain(bookedToRename);

    await expectSeatStatuses(
      ownerApi,
      created.id,
      Object.fromEntries(
        bookedLabels.map((label) => [label, 'Booked' as const])
      )
    );
    await expectSeatedInventory(ownerApi, created, ticketType.Id, {
      sold: 2,
      capacity: 5,
      bookedSeatLabels: bookedLabels,
    });
  });

  test('requires active holds to expire and blocked seats to be explicitly released before removal', async ({
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [{ type: 'Protected Edit Seat', price: 0, totalTickets: 3 }],
      seatingMap: (event) =>
        editableMap(event.ticketTypes[0].Id, ['1', '2', '3']),
    });
    const ticketType = created.ticketTypes[0];
    const holdResponse = await ownerApi.post(
      `/api/public/seating/${created.id}/hold/add`,
      {
        data: {
          HoldToken: null,
          TicketTypeId: ticketType.Id,
          SeatLabel: seatLabel('1'),
        },
      }
    );
    expect(holdResponse.ok()).toBeTruthy();
    const hold = (await holdResponse.json()) as { HoldToken: string };
    const blockResponse = await ownerApi.post(
      `/api/protected/organizers/${created.organizerId}/events/${created.id}/seating-map/block`,
      { data: { SeatLabels: [seatLabel('2')] } }
    );
    expect(blockResponse.ok()).toBeTruthy();
    await expectSeatStatuses(ownerApi, created.id, {
      [seatLabel('1')]: 'Reserved',
      [seatLabel('2')]: 'Blocked',
      [seatLabel('3')]: 'Available',
    });

    const removeHeld = await ownerApi.put(
      `/api/protected/organizers/${created.organizerId}/events/${created.id}/seating-map`,
      { data: editableMap(ticketType.Id, ['2', '3']) }
    );
    expect(removeHeld.status()).toBe(409);
    const heldError = await errorMessage(removeHeld);
    expect(heldError).toContain('currently held in active checkouts');
    expect(heldError).toContain(seatLabel('1'));

    const removeBlocked = await ownerApi.put(
      `/api/protected/organizers/${created.organizerId}/events/${created.id}/seating-map`,
      { data: editableMap(ticketType.Id, ['1', '3']) }
    );
    expect(removeBlocked.status()).toBe(409);
    const blockedError = await errorMessage(removeBlocked);
    expect(blockedError).toContain('currently blocked');
    expect(blockedError).toContain(seatLabel('2'));

    const releaseHold = await ownerApi.delete(
      `/api/public/seating/${created.id}/hold/${hold.HoldToken}`
    );
    expect(releaseHold.ok()).toBeTruthy();
    const unblock = await ownerApi.post(
      `/api/protected/organizers/${created.organizerId}/events/${created.id}/seating-map/unblock`,
      { data: { SeatLabels: [seatLabel('2')] } }
    );
    expect(unblock.ok()).toBeTruthy();

    await updatePublishedSeatingMap(
      ownerApi,
      created,
      editableMap(ticketType.Id, ['3'])
    );
    const finalMap = await readPublicSeatingMap(ownerApi, created.id);
    expect(
      finalMap.Sections[0].Rows[0].Seats.map((seat) => seat.Label)
    ).toEqual([seatLabel('3')]);
    await expectSeatedInventory(ownerApi, created, ticketType.Id, {
      sold: 0,
      capacity: 1,
      bookedSeatLabels: [],
    });
  });
});
