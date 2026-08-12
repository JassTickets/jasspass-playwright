import { test, expect } from '../../fixtures/application';
import { openEvent } from '../../helpers/criticalCheckoutHelpers';
import {
  clickSeatAndWaitForHold,
  createAndPublishSeatingMap,
  expectSeatStatus,
  numberedSeats,
  seatButton,
  type HoldResponse,
} from '../../helpers/seatingHelpers';

test.describe('seated-event hold integrity', () => {
  test.setTimeout(150_000);

  test('allows only one buyer to hold a seat, rehydrates the winning hold, and releases it', async ({
    page,
    browser,
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      hasSeatSelection: true,
      isFreeEvent: true,
      tickets: [{ type: 'Race Reserved', price: 0, totalTickets: 2 }],
    });
    const ticketType = created.ticketTypes[0];
    await createAndPublishSeatingMap(ownerApi, created, [
      {
        Name: 'Race Row',
        Code: 'R',
        TicketTypeId: ticketType.Id,
        Rows: [{ Label: 'A', Seats: numberedSeats(2) }],
      },
    ]);

    const competingContext = await browser.newContext();
    const competingPage = await competingContext.newPage();
    try {
      await Promise.all([
        openEvent(page, created.id, created.name),
        openEvent(competingPage, created.id, created.name),
      ]);

      const [firstAttempt, secondAttempt] = await Promise.all([
        clickSeatAndWaitForHold(page, created.id, 'R-A1'),
        clickSeatAndWaitForHold(competingPage, created.id, 'R-A1'),
      ]);
      expect(
        [firstAttempt.response.status(), secondAttempt.response.status()].sort()
      ).toEqual([200, 409]);

      const winner = firstAttempt.response.ok() ? page : competingPage;
      const loser = firstAttempt.response.ok() ? competingPage : page;
      const winningAttempt = firstAttempt.response.ok()
        ? firstAttempt
        : secondAttempt;
      const hold = winningAttempt.hold!;
      expect(hold.SeatLabels).toEqual(['R-A1']);
      if (hold.Seats) {
        expect(hold.Seats).toEqual([
          { SeatLabel: 'R-A1', TicketTypeId: ticketType.Id },
        ]);
      }
      await expect(
        loser.getByText(/Seat "R-A1" was just taken by another buyer/)
      ).toBeVisible();
      await expectSeatStatus(ownerApi, created.id, 'R-A1', 'Reserved');

      await winner.reload();
      await expect(
        winner.getByText('1 seat selected', { exact: true })
      ).toBeVisible({ timeout: 30_000 });
      await expect(seatButton(winner, 'R-A1')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      const storedHold = await winner.evaluate<string | null>((eventId) => {
        return window.localStorage.getItem(`jass_seat_hold_${eventId}`);
      }, created.id);
      expect(storedHold).toContain(hold.HoldToken);

      const releaseResponsePromise = winner.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' &&
          response
            .url()
            .includes(
              `/api/public/seating/${created.id}/hold/${hold.HoldToken}`
            )
      );
      await winner.getByTitle('Clear selection').click();
      const releaseResponse = await releaseResponsePromise;
      expect(releaseResponse.status()).toBe(204);
      await expectSeatStatus(ownerApi, created.id, 'R-A1', 'Available');
      await expect(
        winner.getByText('1 seat selected', { exact: true })
      ).toHaveCount(0);
      expect(
        await winner.evaluate<string | null>((eventId) => {
          return window.localStorage.getItem(`jass_seat_hold_${eventId}`);
        }, created.id)
      ).toBeNull();
    } finally {
      await competingContext.close();
    }
  });

  test('enforces orphan-seat and event-wide selection limits before checkout', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const created = await eventFactory.create({
      hasSeatSelection: true,
      isFreeEvent: true,
      purchaseLimit: 2,
      tickets: [
        {
          type: 'Rule Reserved',
          price: 0,
          totalTickets: 4,
          maxTicketsPerPurchase: 4,
        },
      ],
    });
    const ticketType = created.ticketTypes[0];
    await createAndPublishSeatingMap(
      ownerApi,
      created,
      [
        {
          Name: 'Rule Row',
          Code: 'O',
          TicketTypeId: ticketType.Id,
          Rows: [{ Label: 'A', Seats: numberedSeats(4) }],
        },
      ],
      { NoOrphanSeats: true, AutoAssignSeats: false, Strategy: 0 }
    );

    await openEvent(page, created.id, created.name);
    const orphanAttempt = await clickSeatAndWaitForHold(
      page,
      created.id,
      'O-A2'
    );
    expect(orphanAttempt.response.status()).toBe(400);
    expect(await orphanAttempt.response.text()).toContain(
      'would leave a single seat empty and alone'
    );
    await expect(
      page.getByText(/would leave a single seat empty and alone/)
    ).toBeVisible();
    await expect(seatButton(page, 'O-A2')).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    const first = await clickSeatAndWaitForHold(page, created.id, 'O-A1');
    const second = await clickSeatAndWaitForHold(page, created.id, 'O-A2');
    expect(first.response.status()).toBe(200);
    expect(second.response.status()).toBe(200);
    expect(second.hold?.HoldToken).toBe(first.hold?.HoldToken);

    let thirdSeatRequestCount = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().includes(`/api/public/seating/${created.id}/hold/add`) &&
        (request.postDataJSON() as { SeatLabel?: string }).SeatLabel === 'O-A3'
      ) {
        thirdSeatRequestCount += 1;
      }
    });
    await seatButton(page, 'O-A3').click();
    await expect(
      page.getByText('You can select at most 2 seats for this order.', {
        exact: true,
      })
    ).toBeVisible();
    expect(thirdSeatRequestCount).toBe(0);
    await expectSeatStatus(ownerApi, created.id, 'O-A1', 'Reserved');
    await expectSeatStatus(ownerApi, created.id, 'O-A2', 'Reserved');
    await expectSeatStatus(ownerApi, created.id, 'O-A3', 'Available');

    const hold = second.hold as HoldResponse;
    const release = await ownerApi.delete(
      `/api/public/seating/${created.id}/hold/${hold.HoldToken}`
    );
    expect(release.status()).toBe(204);
  });
});
