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
  waitForTransaction,
} from '../../helpers/criticalCheckoutHelpers';

type PublicEvent = {
  Id: string;
  IsVisible: boolean;
};

type FullEvent = PublicEvent & {
  IsPrivate: boolean;
};

type Transaction = {
  Confirmation: string;
  Status: string;
  Quantity: number;
  Email: string;
};

type Ticket = {
  Confirmation: string;
  Status: string;
  TicketTypeId: string;
};

test.describe('event visibility boundaries', () => {
  test.setTimeout(120_000);

  test('keeps a private event out of discovery while allowing direct-link RSVP', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const ticketName = 'Private Link RSVP';
    const created = await eventFactory.create({
      isFreeEvent: true,
      isPrivate: true,
      tickets: [{ type: ticketName, price: 0 }],
    });
    const ticketType = created.ticketTypes[0];
    const buyer = createUniqueBuyer('PrivateLink');

    const [organizerEvents, directEventResponse, fullEventResponse] =
      await Promise.all([
        getApiArray<PublicEvent>(
          ownerApi.get(`/api/public/organizers/${created.organizerId}/events`),
          'Events'
        ),
        ownerApi.get(`/api/public/events/${created.id}`),
        ownerApi.get(`/api/protected/events/${created.id}`),
      ]);
    expect(
      organizerEvents.some((event) => event.Id === created.id),
      'Private events must not be exposed by the public organizer listing.'
    ).toBe(false);
    expect(directEventResponse.ok()).toBeTruthy();
    expect(fullEventResponse.ok()).toBeTruthy();
    const directEvent = (await directEventResponse.json()) as PublicEvent;
    const fullEvent = (await fullEventResponse.json()) as FullEvent;
    expect(directEvent).toMatchObject({
      Id: created.id,
      IsVisible: true,
    });
    expect(fullEvent).toMatchObject({
      Id: created.id,
      IsPrivate: true,
      IsVisible: true,
    });

    await openEvent(page, created.id, created.name);
    await expect(page.getByText(ticketName, { exact: true })).toBeVisible();
    await selectTicketQuantity(page, created.id, ticketName, 1);
    const orderSummary = await openCheckout(page);
    await expect(
      orderSummary.getByText(ticketName, { exact: true })
    ).toBeVisible();
    await expect(orderSummary.getByText('x1', { exact: true })).toBeVisible();
    await fillGuestContact(page, buyer);
    const purchase = await submitPurchase(page, 'RSVP');
    await assertOrderConfirmation(page, created.name, purchase.Confirmation);

    const transaction = await waitForTransaction<Transaction>(
      ownerApi,
      created.id,
      purchase.Confirmation
    );
    expect(transaction).toMatchObject({
      Status: 'Complete',
      Quantity: 1,
      Email: buyer.email,
    });
    const tickets = await getApiArray<Ticket>(
      ownerApi.get(`/api/protected/events/${created.id}/tickets`),
      'Tickets'
    );
    expect(tickets).toEqual([
      expect.objectContaining({
        Confirmation: purchase.Confirmation,
        Status: 'Active',
        TicketTypeId: ticketType.Id,
      }),
    ]);
  });
});
