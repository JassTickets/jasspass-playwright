import type { APIRequestContext } from '@playwright/test';
import { test, expect, type CreatedEvent } from '../../fixtures/application';
import { getApiArray } from '../../helpers/criticalCheckoutHelpers';
import { expectSeatStatus, numberedSeats } from '../../helpers/seatingHelpers';
import {
  purchaseAutoAssignedFreeTickets,
  type SeatedTicket,
} from '../../helpers/seatedCheckoutHelpers';

async function toggleTicket(
  ownerApi: APIRequestContext,
  created: CreatedEvent,
  ticketId: string,
  releaseSeatAndCapacity: boolean
): Promise<SeatedTicket> {
  const response = await ownerApi.post('/api/protected/tickets/status', {
    data: {
      ticketId,
      eventId: created.id,
      organizerId: created.organizerId,
      releaseSeatAndCapacity,
    },
  });
  const body = await response.text();
  expect(
    response.ok(),
    `Ticket status toggle failed with ${response.status()}: ${body}`
  ).toBeTruthy();
  return JSON.parse(body) as SeatedTicket;
}

async function soldCount(
  ownerApi: APIRequestContext,
  eventId: string,
  ticketTypeId: string
): Promise<number> {
  const response = await ownerApi.get(`/api/public/events/${eventId}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    Event?: { TicketsSold?: Record<string, number> };
    TicketsSold?: Record<string, number>;
  };
  return (body.Event ?? body).TicketsSold?.[ticketTypeId] ?? 0;
}

test.describe('seated ticket deactivation and reactivation', () => {
  test.setTimeout(180_000);

  test('keeps the booked seat and sold inventory when deactivated without release', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [{ type: 'Retained Seat', price: 0, totalTickets: 2 }],
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Retained Section',
            Code: 'KEEP',
            TicketTypeId: event.ticketTypes[0].Id,
            Rows: [{ Label: 'A', Seats: numberedSeats(2) }],
          },
        ],
        SelectionRules: { NoOrphanSeats: false, AutoAssignSeats: true },
      }),
    });
    const ticketType = created.ticketTypes[0];
    const purchase = await purchaseAutoAssignedFreeTickets(
      page,
      ownerApi,
      created,
      ticketType,
      1,
      'DeactivateKeep'
    );
    const ticket = purchase.tickets[0];
    const seatLabel = purchase.hold.SeatLabels[0];

    const inactive = await toggleTicket(ownerApi, created, ticket.Id, false);
    expect(inactive).toMatchObject({
      Id: ticket.Id,
      Status: 'Inactive',
      CapacityReleased: false,
    });
    await expectSeatStatus(ownerApi, created.id, seatLabel, 'Booked');
    expect(await soldCount(ownerApi, created.id, ticketType.Id)).toBe(1);

    const active = await toggleTicket(ownerApi, created, ticket.Id, false);
    expect(active).toMatchObject({
      Id: ticket.Id,
      Status: 'Active',
      CapacityReleased: false,
    });
    await expectSeatStatus(ownerApi, created.id, seatLabel, 'Booked');
    expect(await soldCount(ownerApi, created.id, ticketType.Id)).toBe(1);
  });

  test('releases capacity and reclaims the exact original seat on reactivation', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [{ type: 'Recoverable Seat', price: 0, totalTickets: 2 }],
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Recoverable Section',
            Code: 'BACK',
            TicketTypeId: event.ticketTypes[0].Id,
            Rows: [{ Label: 'A', Seats: numberedSeats(2) }],
          },
        ],
        SelectionRules: { NoOrphanSeats: false, AutoAssignSeats: true },
      }),
    });
    const ticketType = created.ticketTypes[0];
    const purchase = await purchaseAutoAssignedFreeTickets(
      page,
      ownerApi,
      created,
      ticketType,
      1,
      'DeactivateRelease'
    );
    const ticket = purchase.tickets[0];
    const seatLabel = purchase.hold.SeatLabels[0];

    const inactive = await toggleTicket(ownerApi, created, ticket.Id, true);
    expect(inactive).toMatchObject({
      Status: 'Inactive',
      CapacityReleased: true,
    });
    await expectSeatStatus(ownerApi, created.id, seatLabel, 'Available');
    expect(await soldCount(ownerApi, created.id, ticketType.Id)).toBe(0);

    const active = await toggleTicket(ownerApi, created, ticket.Id, false);
    expect(active).toMatchObject({
      Status: 'Active',
      CapacityReleased: false,
    });
    await expectSeatStatus(ownerApi, created.id, seatLabel, 'Booked');
    expect(await soldCount(ownerApi, created.id, ticketType.Id)).toBe(1);
  });

  test('rolls capacity back when another buyer takes the released seat', async ({
    page,
    browser,
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [{ type: 'Contended Seat', price: 0, totalTickets: 2 }],
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Single Section',
            Code: 'ONE',
            TicketTypeId: event.ticketTypes[0].Id,
            Rows: [{ Label: 'A', Seats: numberedSeats(2) }],
          },
        ],
        SelectionRules: { NoOrphanSeats: false, AutoAssignSeats: true },
      }),
    });
    const ticketType = created.ticketTypes[0];
    const first = await purchaseAutoAssignedFreeTickets(
      page,
      ownerApi,
      created,
      ticketType,
      1,
      'OriginalOwner'
    );
    const originalTicket = first.tickets[0];
    const seatLabel = first.hold.SeatLabels[0];
    await toggleTicket(ownerApi, created, originalTicket.Id, true);

    const competingContext = await browser.newContext();
    try {
      const competingPage = await competingContext.newPage();
      const competingPurchase = await purchaseAutoAssignedFreeTickets(
        competingPage,
        ownerApi,
        created,
        ticketType,
        1,
        'ReplacementOwner'
      );
      const competingConfirmation = competingPurchase.confirmation;
      expect(competingPurchase.hold.SeatLabels).toEqual([seatLabel]);
      await expectSeatStatus(ownerApi, created.id, seatLabel, 'Booked');

      const reactivation = await ownerApi.post(
        '/api/protected/tickets/status',
        {
          data: {
            ticketId: originalTicket.Id,
            eventId: created.id,
            organizerId: created.organizerId,
            releaseSeatAndCapacity: false,
          },
        }
      );
      expect(reactivation.ok()).toBeFalsy();
      expect(await reactivation.text()).toContain(
        `seat ${seatLabel} has already been taken`
      );

      const tickets = await getApiArray<SeatedTicket>(
        ownerApi.get(`/api/protected/events/${created.id}/tickets`),
        'Tickets'
      );
      expect(
        tickets.find((candidate) => candidate.Id === originalTicket.Id)
      ).toMatchObject({
        Status: 'Inactive',
        CapacityReleased: true,
      });
      expect(
        tickets.find(
          (candidate) => candidate.Confirmation === competingConfirmation
        )
      ).toMatchObject({ Status: 'Active' });
      expect(await soldCount(ownerApi, created.id, ticketType.Id)).toBe(1);
      await expectSeatStatus(ownerApi, created.id, seatLabel, 'Booked');
    } finally {
      await competingContext.close();
    }
  });
});
