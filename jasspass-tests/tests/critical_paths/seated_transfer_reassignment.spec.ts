import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '../../fixtures/application';
import { getApiArray } from '../../helpers/criticalCheckoutHelpers';
import {
  expectSeatStatuses,
  numberedSeats,
  readPublicSeatingMap,
  type HoldResponse,
} from '../../helpers/seatingHelpers';
import {
  expectSeatedInventory,
  purchaseAutoAssignedFreeTickets,
  type SeatedTicket,
} from '../../helpers/seatedCheckoutHelpers';
import type { CreatedTicketType } from '../../fixtures/application';

async function holdBestAvailable(
  api: APIRequestContext,
  eventId: string,
  ticketTypeId: string
): Promise<HoldResponse> {
  const response = await api.post(
    `/api/public/seating/${eventId}/hold/best-available/batch`,
    { data: { Items: [{ TicketTypeId: ticketTypeId, Quantity: 1 }] } }
  );
  const body = await response.text();
  expect(
    response.ok(),
    `Best-available hold failed with ${response.status()}: ${body}`
  ).toBeTruthy();
  return JSON.parse(body) as HoldResponse;
}

test.describe('seated transfer and ticket-type reassignment', () => {
  test.setTimeout(240_000);

  test('moves a ticket into a held destination seat and releases its source seat', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const source = await eventFactory.create({
      isFreeEvent: true,
      tickets: [{ type: 'Transfer Source', price: 0, totalTickets: 1 }],
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Source Section',
            Code: 'SRC',
            TicketTypeId: event.ticketTypes[0].Id,
            Rows: [{ Label: 'A', Seats: numberedSeats(1) }],
          },
        ],
        SelectionRules: { NoOrphanSeats: false, AutoAssignSeats: true },
      }),
    });
    const destination = await eventFactory.create({
      isFreeEvent: true,
      tickets: [{ type: 'Transfer Destination', price: 0, totalTickets: 1 }],
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Destination Section',
            Code: 'DST',
            TicketTypeId: event.ticketTypes[0].Id,
            Rows: [{ Label: 'A', Seats: numberedSeats(1) }],
          },
        ],
        SelectionRules: { NoOrphanSeats: false, AutoAssignSeats: true },
      }),
    });
    const sourcePurchase = await purchaseAutoAssignedFreeTickets(
      page,
      ownerApi,
      source,
      source.ticketTypes[0],
      1,
      'TransferAttendee'
    );
    const sourceTicket = sourcePurchase.tickets[0];
    const destinationHold = await holdBestAvailable(
      ownerApi,
      destination.id,
      destination.ticketTypes[0].Id
    );

    const response = await ownerApi.post(
      `/api/protected/organizers/${source.organizerId}/tickets/transfer`,
      {
        data: {
          SourceTicketId: sourceTicket.Id,
          DestinationEventId: destination.id,
          DestinationTicketTypeId: destination.ticketTypes[0].Id,
          HoldToken: destinationHold.HoldToken,
          Seats: destinationHold.SeatLabels,
          ReleaseSeatAndCapacity: true,
        },
      }
    );
    const body = await response.text();
    expect(
      response.ok(),
      `Seated transfer failed with ${response.status()}: ${body}`
    ).toBeTruthy();
    const transfer = JSON.parse(body) as { NewConfirmation: string };

    const [sourceTickets, destinationTickets] = await Promise.all([
      getApiArray<SeatedTicket>(
        ownerApi.get(`/api/protected/events/${source.id}/tickets`),
        'Tickets'
      ),
      getApiArray<SeatedTicket>(
        ownerApi.get(`/api/protected/events/${destination.id}/tickets`),
        'Tickets'
      ),
    ]);
    expect(
      sourceTickets.find((ticket) => ticket.Id === sourceTicket.Id)
    ).toMatchObject({
      Status: 'Inactive',
      CapacityReleased: true,
    });
    expect(
      destinationTickets.find(
        (ticket) => ticket.Confirmation === transfer.NewConfirmation
      )
    ).toMatchObject({
      Status: 'Active',
      TicketTypeId: destination.ticketTypes[0].Id,
      Title: expect.stringContaining(destinationHold.SeatLabels[0]),
    });
    await expectSeatStatuses(ownerApi, source.id, { 'SRC-A1': 'Available' });
    await expectSeatStatuses(ownerApi, destination.id, { 'DST-A1': 'Booked' });
    await expectSeatedInventory(
      ownerApi,
      destination,
      destination.ticketTypes[0].Id,
      {
        sold: 1,
        capacity: 1,
        bookedSeatLabels: ['DST-A1'],
      }
    );
  });

  test('leaves the source untouched when the destination hold is no longer valid', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const source = await eventFactory.create({
      isFreeEvent: true,
      tickets: [{ type: 'Atomic Source', price: 0, totalTickets: 1 }],
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Atomic Source Section',
            Code: 'AS',
            TicketTypeId: event.ticketTypes[0].Id,
            Rows: [{ Label: 'A', Seats: numberedSeats(1) }],
          },
        ],
        SelectionRules: { NoOrphanSeats: false, AutoAssignSeats: true },
      }),
    });
    const destination = await eventFactory.create({
      isFreeEvent: true,
      tickets: [{ type: 'Atomic Destination', price: 0, totalTickets: 1 }],
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Atomic Destination Section',
            Code: 'AD',
            TicketTypeId: event.ticketTypes[0].Id,
            Rows: [{ Label: 'A', Seats: numberedSeats(1) }],
          },
        ],
        SelectionRules: { NoOrphanSeats: false, AutoAssignSeats: true },
      }),
    });
    const purchase = await purchaseAutoAssignedFreeTickets(
      page,
      ownerApi,
      source,
      source.ticketTypes[0],
      1,
      'AtomicTransfer'
    );
    const destinationHold = await holdBestAvailable(
      ownerApi,
      destination.id,
      destination.ticketTypes[0].Id
    );
    const release = await ownerApi.delete(
      `/api/public/seating/${destination.id}/hold/${destinationHold.HoldToken}`
    );
    expect(release.ok()).toBeTruthy();

    const transfer = await ownerApi.post(
      `/api/protected/organizers/${source.organizerId}/tickets/transfer`,
      {
        data: {
          SourceTicketId: purchase.tickets[0].Id,
          DestinationEventId: destination.id,
          DestinationTicketTypeId: destination.ticketTypes[0].Id,
          HoldToken: destinationHold.HoldToken,
          Seats: destinationHold.SeatLabels,
          ReleaseSeatAndCapacity: true,
        },
      }
    );
    expect(transfer.ok()).toBeFalsy();
    expect(await transfer.text()).toContain(
      'original ticket was left unchanged'
    );

    const sourceTickets = await getApiArray<SeatedTicket>(
      ownerApi.get(`/api/protected/events/${source.id}/tickets`),
      'Tickets'
    );
    const destinationTickets = await getApiArray<SeatedTicket>(
      ownerApi.get(`/api/protected/events/${destination.id}/tickets`),
      'Tickets'
    );
    expect(
      sourceTickets.find((ticket) => ticket.Id === purchase.tickets[0].Id)
    ).toMatchObject({
      Status: 'Active',
      CapacityReleased: false,
    });
    expect(destinationTickets).toHaveLength(0);
    await expectSeatStatuses(ownerApi, source.id, { 'AS-A1': 'Booked' });
    await expectSeatStatuses(ownerApi, destination.id, {
      'AD-A1': 'Available',
    });
  });

  test('reassigns only available seats and updates map and ticket-type capacities', async ({
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [
        { type: 'Reassign Source', price: 0, totalTickets: 3 },
        { type: 'Reassign Target', price: 0, totalTickets: 1 },
      ],
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Reassign Section',
            Code: 'MOVE',
            TicketTypeId: event.ticketTypes[0].Id,
            Rows: [
              {
                Label: 'A',
                Seats: [
                  { Number: '1' },
                  { Number: '2' },
                  { Number: '3', TicketTypeId: event.ticketTypes[1].Id },
                ],
              },
            ],
          },
        ],
        SelectionRules: { NoOrphanSeats: false, AutoAssignSeats: false },
      }),
    });
    const [sourceType, targetType] = created.ticketTypes;
    const held = await ownerApi.post(
      `/api/public/seating/${created.id}/hold/add`,
      {
        data: {
          HoldToken: null,
          TicketTypeId: sourceType.Id,
          SeatLabel: 'MOVE-A2',
        },
      }
    );
    expect(held.ok()).toBeTruthy();
    const hold = (await held.json()) as HoldResponse;

    const response = await ownerApi.post(
      `/api/protected/organizers/${created.organizerId}/events/${created.id}/seating-map/reassign`,
      {
        data: {
          SeatLabels: ['MOVE-A1', 'MOVE-A2'],
          TargetTicketTypeId: targetType.Id,
        },
      }
    );
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toEqual(['MOVE-A1']);

    const map = await readPublicSeatingMap(ownerApi, created.id);
    const seats = map.Sections[0].Rows[0].Seats;
    expect(
      seats.find((seat) => seat.Label === 'MOVE-A1')?.EffectiveTicketTypeId
    ).toBe(targetType.Id);
    expect(
      seats.find((seat) => seat.Label === 'MOVE-A2')?.EffectiveTicketTypeId
    ).toBe(sourceType.Id);
    const ticketTypes = await getApiArray<CreatedTicketType>(
      ownerApi.get(`/api/public/events/${created.id}/ticket-types`),
      'TicketTypes'
    );
    expect(
      ticketTypes.find((type) => type.Id === sourceType.Id)?.TotalTickets
    ).toBe(1);
    expect(
      ticketTypes.find((type) => type.Id === targetType.Id)?.TotalTickets
    ).toBe(2);
    await expectSeatStatuses(ownerApi, created.id, {
      'MOVE-A1': 'Available',
      'MOVE-A2': 'Reserved',
    });

    const release = await ownerApi.delete(
      `/api/public/seating/${created.id}/hold/${hold.HoldToken}`
    );
    expect(release.ok()).toBeTruthy();
  });
});
