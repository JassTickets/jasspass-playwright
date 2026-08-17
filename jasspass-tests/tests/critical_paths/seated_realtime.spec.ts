import type { Page } from '@playwright/test';
import { test, expect, type CreatedEvent } from '../../fixtures/application';
import {
  createUniqueBuyer,
  fillGuestContact,
  openCheckout,
  openEvent,
  submitPurchase,
} from '../../helpers/criticalCheckoutHelpers';
import {
  clickSeatAndWaitForHold,
  numberedSeats,
  openOrganizerSeatingMap,
  organizerSeat,
  seatButton,
} from '../../helpers/seatingHelpers';

function waitForSeatingGroup(page: Page, eventId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out joining seating hub for ${eventId}`)),
      30_000
    );
    page.on('websocket', (socket) => {
      if (!socket.url().includes('/hubs/seating')) return;
      socket.on('framesent', (frame) => {
        const payload = String(frame.payload);
        if (
          payload.includes('JoinEventSeatingGroup') &&
          payload.includes(eventId)
        ) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  });
}

async function openBuyerWithRealtime(
  page: Page,
  created: CreatedEvent
): Promise<void> {
  const joined = waitForSeatingGroup(page, created.id);
  await openEvent(page, created.id, created.name);
  await joined;
}

test.describe('real-time seated inventory updates', () => {
  test.setTimeout(240_000);

  test('propagates buyer holds, releases, and bookings without refreshing other pages', async ({
    browser,
    ownerPage,
    eventFactory,
  }) => {
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [{ type: 'Realtime Reserved', price: 0, totalTickets: 2 }],
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Realtime Floor',
            Code: 'RT',
            TicketTypeId: event.ticketTypes[0].Id,
            Rows: [{ Label: 'A', Seats: numberedSeats(2) }],
          },
        ],
        SelectionRules: { NoOrphanSeats: false, AutoAssignSeats: false },
      }),
    });
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    try {
      const firstBuyer = await firstContext.newPage();
      const secondBuyer = await secondContext.newPage();
      const ownerJoined = waitForSeatingGroup(ownerPage, created.id);
      await Promise.all([
        openBuyerWithRealtime(firstBuyer, created),
        openBuyerWithRealtime(secondBuyer, created),
        openOrganizerSeatingMap(ownerPage, created.organizerId, created.id),
      ]);
      await ownerJoined;

      const firstHold = await clickSeatAndWaitForHold(
        firstBuyer,
        created.id,
        'RT-A1'
      );
      expect(firstHold.response.ok()).toBeTruthy();
      await expect(seatButton(secondBuyer, 'RT-A1')).toHaveAttribute(
        'title',
        'RT-A1 · Reserved'
      );
      await expect(organizerSeat(ownerPage, 'RT-A1', 'Held')).toBeVisible();

      const releasePromise = firstBuyer.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response
            .url()
            .includes(`/api/public/seating/${created.id}/hold/remove`)
      );
      await seatButton(firstBuyer, 'RT-A1').click();
      expect((await releasePromise).ok()).toBeTruthy();
      await expect(seatButton(secondBuyer, 'RT-A1')).toHaveAttribute(
        'title',
        'RT-A1 · Available'
      );
      await expect(
        organizerSeat(ownerPage, 'RT-A1', 'Available')
      ).toBeVisible();

      const secondHold = await clickSeatAndWaitForHold(
        firstBuyer,
        created.id,
        'RT-A1'
      );
      expect(secondHold.response.ok()).toBeTruthy();
      await openCheckout(firstBuyer);
      await fillGuestContact(firstBuyer, createUniqueBuyer('RealtimeBook'));
      await submitPurchase(firstBuyer, 'RSVP');
      await expect(seatButton(secondBuyer, 'RT-A1')).toHaveAttribute(
        'title',
        'RT-A1 · Booked'
      );
      await expect(organizerSeat(ownerPage, 'RT-A1', 'Sold')).toBeVisible();
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });

  test('propagates organizer block and unblock actions to an open buyer map', async ({
    browser,
    ownerPage,
    eventFactory,
  }) => {
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [{ type: 'Realtime Managed', price: 0, totalTickets: 1 }],
      seatingMap: (event) => ({
        Sections: [
          {
            Name: 'Realtime Managed Floor',
            Code: 'RM',
            TicketTypeId: event.ticketTypes[0].Id,
            Rows: [{ Label: 'A', Seats: numberedSeats(1) }],
          },
        ],
        SelectionRules: { NoOrphanSeats: false, AutoAssignSeats: false },
      }),
    });
    const buyerContext = await browser.newContext();
    try {
      const buyerPage = await buyerContext.newPage();
      const ownerJoined = waitForSeatingGroup(ownerPage, created.id);
      await Promise.all([
        openBuyerWithRealtime(buyerPage, created),
        openOrganizerSeatingMap(ownerPage, created.organizerId, created.id),
      ]);
      await ownerJoined;

      await organizerSeat(ownerPage, 'RM-A1', 'Available').click();
      const blockPromise = ownerPage.waitForResponse((response) =>
        response.url().includes('/seating-map/block')
      );
      await ownerPage.getByRole('button', { name: 'Apply changes' }).click();
      expect((await blockPromise).ok()).toBeTruthy();
      await expect(seatButton(buyerPage, 'RM-A1')).toHaveAttribute(
        'title',
        'RM-A1 · Blocked'
      );
      await expect(seatButton(buyerPage, 'RM-A1')).toBeDisabled();

      await organizerSeat(ownerPage, 'RM-A1', 'Blocked').click();
      const unblockPromise = ownerPage.waitForResponse((response) =>
        response.url().includes('/seating-map/unblock')
      );
      await ownerPage.getByRole('button', { name: 'Apply changes' }).click();
      expect((await unblockPromise).ok()).toBeTruthy();
      await expect(seatButton(buyerPage, 'RM-A1')).toHaveAttribute(
        'title',
        'RM-A1 · Available'
      );
      await expect(seatButton(buyerPage, 'RM-A1')).toBeEnabled();
    } finally {
      await buyerContext.close();
    }
  });
});
