import { test, expect } from '../../fixtures/application';
import {
  assertOrderConfirmation,
  createUniqueBuyer,
  fillGuestContact,
  getApiArray,
  openCheckout,
  openEvent,
  selectTicketQuantity,
  submitPurchase,
} from '../../helpers/criticalCheckoutHelpers';
import { JASS_TEST_URL } from '../../constants';

type Ticket = {
  Id: string;
  EventId: string;
  Confirmation: string;
  FirstName: string;
  LastName: string;
  Scanned: boolean;
  ScannedAtUtc?: string | null;
};

test.describe('ticket check-in lifecycle', () => {
  test.setTimeout(120_000);

  test('an organizer can scan and unscan an attendee with persisted audit state', async ({
    page,
    ownerPage,
    ownerApi,
    ownerIdentity,
    eventFactory,
  }) => {
    const ticketTypeName = 'Check-in Admission';
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [{ type: ticketTypeName, price: 0 }],
    });
    const buyer = createUniqueBuyer('TicketScan');

    await openEvent(page, created.id, created.name);
    await selectTicketQuantity(page, created.id, ticketTypeName, 1);
    await openCheckout(page);
    await fillGuestContact(page, buyer);
    const purchase = await submitPurchase(page, 'RSVP');
    await assertOrderConfirmation(page, created.name, purchase.Confirmation);

    let purchasedTicket: Ticket | undefined;
    await expect
      .poll(
        async () => {
          const tickets = await getApiArray<Ticket>(
            ownerApi.get(`/api/protected/events/${created.id}/tickets`),
            'Tickets'
          );
          purchasedTicket = tickets.find(
            (ticket) => ticket.Confirmation === purchase.Confirmation
          );
          return purchasedTicket?.Id;
        },
        { timeout: 30_000, intervals: [500, 1_000, 2_000] }
      )
      .not.toBeUndefined();

    expect(purchasedTicket).toMatchObject({
      EventId: created.id,
      Confirmation: purchase.Confirmation,
      FirstName: buyer.firstName,
      LastName: buyer.lastName,
      Scanned: false,
    });
    expect(purchasedTicket?.ScannedAtUtc ?? null).toBeNull();

    await ownerPage.goto(
      `${JASS_TEST_URL}/portal/organizer/company/${created.organizerId}/event/${created.id}`
    );
    const ordersAndAttendees = ownerPage
      .getByRole('button', { name: 'Orders & Attendees' })
      .first();
    await expect(ordersAndAttendees).toBeVisible({ timeout: 30_000 });
    await ordersAndAttendees.click();
    await ownerPage
      .getByRole('button', { name: 'Attendees', exact: true })
      .click();
    await ownerPage.getByPlaceholder(/Search Attendees/i).fill(buyer.lastName);

    const attendeeRow = ownerPage
      .getByRole('row')
      .filter({ hasText: `${buyer.firstName} ${buyer.lastName}` });
    await expect(attendeeRow).toHaveCount(1);
    await expect(attendeeRow).toContainText(ticketTypeName);
    await expect(
      attendeeRow.getByText('Not Scanned', { exact: true })
    ).toBeVisible();

    const scanStartedAt = Date.now();
    const scanResponsePromise = ownerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/protected/tickets/scan'
    );
    await attendeeRow.getByRole('checkbox').first().click();
    const scanResponse = await scanResponsePromise;
    const scanResponseBody = await scanResponse
      .text()
      .catch(() => '<response body unavailable>');
    const scanBody = scanResponse.request().postDataJSON() as Record<
      string,
      unknown
    >;

    expect(
      scanResponse.status(),
      `Ticket scan failed: ${scanResponseBody}`
    ).toBe(200);
    expect(scanBody).toEqual({
      eventId: created.id,
      ticketId: purchasedTicket!.Id,
      operatorUserId: ownerIdentity.userId,
    });
    await expect(attendeeRow.getByRole('checkbox').first()).toBeChecked();
    await expect(
      attendeeRow.getByText('Scanned', { exact: true })
    ).toBeVisible();

    let scannedAtUtc: string | null | undefined;
    await expect
      .poll(
        async () => {
          const tickets = await getApiArray<Ticket>(
            ownerApi.get(`/api/protected/events/${created.id}/tickets`),
            'Tickets'
          );
          const ticket = tickets.find(
            (candidate) => candidate.Id === purchasedTicket!.Id
          );
          scannedAtUtc = ticket?.ScannedAtUtc;
          return ticket?.Scanned;
        },
        { timeout: 30_000, intervals: [500, 1_000, 2_000] }
      )
      .toBe(true);
    expect(scannedAtUtc).toBeTruthy();
    expect(Date.parse(scannedAtUtc!)).toBeGreaterThanOrEqual(
      scanStartedAt - 5_000
    );
    expect(Date.parse(scannedAtUtc!)).toBeLessThanOrEqual(Date.now() + 5_000);

    const unscanResponsePromise = ownerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/protected/tickets/unscan'
    );
    await attendeeRow.getByRole('checkbox').first().click();
    const unscanResponse = await unscanResponsePromise;
    const unscanResponseBody = await unscanResponse
      .text()
      .catch(() => '<response body unavailable>');
    const unscanBody = unscanResponse.request().postDataJSON() as Record<
      string,
      unknown
    >;

    expect(
      unscanResponse.status(),
      `Ticket unscan failed: ${unscanResponseBody}`
    ).toBe(200);
    expect(unscanBody).toEqual(scanBody);
    await expect(attendeeRow.getByRole('checkbox').first()).not.toBeChecked();
    await expect(
      attendeeRow.getByText('Not Scanned', { exact: true })
    ).toBeVisible();

    await expect
      .poll(
        async () => {
          const tickets = await getApiArray<Ticket>(
            ownerApi.get(`/api/protected/events/${created.id}/tickets`),
            'Tickets'
          );
          const ticket = tickets.find(
            (candidate) => candidate.Id === purchasedTicket!.Id
          );
          return {
            scanned: ticket?.Scanned,
            scannedAtUtc: ticket?.ScannedAtUtc ?? null,
          };
        },
        { timeout: 30_000, intervals: [500, 1_000, 2_000] }
      )
      .toEqual({ scanned: false, scannedAtUtc: null });
  });
});
