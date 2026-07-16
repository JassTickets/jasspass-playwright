import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/application';
import {
  assertOrderConfirmation,
  createUniqueBuyer,
  fillGuestContact,
  getApiArray,
  openCheckout,
  openEvent,
  purchaseButton,
  selectTicketQuantity,
  submitPurchase,
  waitForTransaction,
} from '../../helpers/criticalCheckoutHelpers';

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

async function prepareRsvp(
  page: Page,
  eventId: string,
  eventName: string,
  ticketTypeName: string,
  quantity: number,
  buyer: ReturnType<typeof createUniqueBuyer>
) {
  await openEvent(page, eventId, eventName);
  await selectTicketQuantity(page, eventId, ticketTypeName, quantity);
  const orderSummary = await openCheckout(page);
  await expect(
    orderSummary.getByText(ticketTypeName, { exact: true })
  ).toBeVisible();
  await expect(
    orderSummary.getByText(`x${quantity}`, { exact: true })
  ).toBeVisible();
  await fillGuestContact(page, buyer);
  await expect(purchaseButton(page, 'RSVP')).toBeEnabled();
}

test.describe('ticket inventory integrity', () => {
  test.setTimeout(150_000);

  test('rejects a stale checkout after another buyer purchases the last ticket', async ({
    page,
    browser,
    eventFactory,
    ownerApi,
  }) => {
    const ticketName = 'Last Available RSVP';
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [{ type: ticketName, price: 0, totalTickets: 1 }],
    });
    const ticketType = created.ticketTypes[0];
    const staleBuyer = createUniqueBuyer('StaleInventory');
    const winningBuyer = createUniqueBuyer('LastInventory');

    await prepareRsvp(
      page,
      created.id,
      created.name,
      ticketName,
      1,
      staleBuyer
    );

    const competingContext = await browser.newContext();
    const competingPage = await competingContext.newPage();
    await prepareRsvp(
      competingPage,
      created.id,
      created.name,
      ticketName,
      1,
      winningBuyer
    );
    const winningPurchase = await submitPurchase(competingPage, 'RSVP');
    await assertOrderConfirmation(
      competingPage,
      created.name,
      winningPurchase.Confirmation
    );
    await competingContext.close();

    const winningTransaction = await waitForTransaction<Transaction>(
      ownerApi,
      created.id,
      winningPurchase.Confirmation
    );
    expect(winningTransaction).toMatchObject({
      Status: 'Complete',
      Quantity: 1,
      Email: winningBuyer.email,
    });

    let purchaseRequestCount = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().includes('/api/public/payments/purchase')
      ) {
        purchaseRequestCount += 1;
      }
    });
    const rejectedCalculationPromise = page.waitForResponse((response) => {
      if (
        response.request().method() !== 'POST' ||
        !response.url().includes('/api/public/payments/checkout')
      ) {
        return false;
      }
      const body = response.request().postDataJSON() as { EventId?: string };
      return body.EventId === created.id;
    });
    await purchaseButton(page, 'RSVP').click();
    const rejectedCalculation = await rejectedCalculationPromise;
    const expectedError = `The requested quantity 1 exceeds the available ${ticketName} tickets at this moment.`;
    expect(rejectedCalculation.status()).toBe(400);
    expect(await rejectedCalculation.text()).toBe(expectedError);
    await expect(
      page.getByRole('alert').filter({ hasText: expectedError }).first()
    ).toBeVisible();
    expect(purchaseRequestCount).toBe(0);
    await expect(page).toHaveURL(new RegExp(`/event/${created.id}(?:\\?|$)`));

    const [transactions, tickets] = await Promise.all([
      getApiArray<Transaction>(
        ownerApi.get(`/api/protected/events/${created.id}/transactions`),
        'Transactions'
      ),
      getApiArray<Ticket>(
        ownerApi.get(`/api/protected/events/${created.id}/tickets`),
        'Tickets'
      ),
    ]);
    expect(transactions).toEqual([
      expect.objectContaining({
        Confirmation: winningPurchase.Confirmation,
        Status: 'Complete',
        Quantity: 1,
      }),
    ]);
    expect(tickets).toEqual([
      expect.objectContaining({
        Confirmation: winningPurchase.Confirmation,
        Status: 'Active',
        TicketTypeId: ticketType.Id,
      }),
    ]);

    await page.reload();
    await expect(
      page.getByRole('heading', { name: created.name }).first()
    ).toBeVisible({ timeout: 30_000 });
    const soldOutRow = page
      .getByText(ticketName, { exact: true })
      .first()
      .locator(
        'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " rounded-lg ")][1]'
      );
    await expect(
      soldOutRow.getByText('Sold Out', { exact: true })
    ).toBeVisible();
    await expect(soldOutRow.getByRole('button')).toHaveCount(0);
    const soldOutCta = page.locator('[data-checkout-cta="true"]').first();
    await expect(soldOutCta).toBeEnabled();
    await expect(soldOutCta).toHaveText('Join Waitlist');
  });

  test('rejects a tampered RSVP request above the server-side purchase limit', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const ticketName = 'Limited RSVP';
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [
        {
          type: ticketName,
          price: 0,
          totalTickets: 10,
          maxTicketsPerPurchase: 2,
        },
      ],
    });
    const ticketType = created.ticketTypes[0];
    const buyer = createUniqueBuyer('TamperedLimit');

    await prepareRsvp(page, created.id, created.name, ticketName, 2, buyer);

    await page.route('**/api/public/payments/purchase', async (route) => {
      const body = route.request().postDataJSON() as {
        purchase: {
          tickets: Array<{ id: string; quantity: number }>;
        };
      };
      const targetTicket = body.purchase.tickets.find(
        (ticket) => ticket.id === ticketType.Id
      );
      expect(targetTicket).toBeDefined();
      targetTicket!.quantity = 3;

      const response = await route.fetch({
        postData: JSON.stringify(body),
      });
      await route.fulfill({ response });
    });

    const rejectedPurchasePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/public/payments/purchase')
    );
    await purchaseButton(page, 'RSVP').click();
    const rejectedPurchase = await rejectedPurchasePromise;
    const expectedError = `Maximum 2 ticket(s) allowed per purchase for '${ticketName}'.`;
    expect(rejectedPurchase.status()).toBe(400);
    expect(await rejectedPurchase.text()).toBe(expectedError);
    await expect(
      page.getByRole('alert').filter({ hasText: expectedError }).first()
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/event/${created.id}(?:\\?|$)`));

    const [transactions, tickets, eventResponse] = await Promise.all([
      getApiArray<Transaction>(
        ownerApi.get(`/api/protected/events/${created.id}/transactions`),
        'Transactions'
      ),
      getApiArray<Ticket>(
        ownerApi.get(`/api/protected/events/${created.id}/tickets`),
        'Tickets'
      ),
      ownerApi.get(`/api/public/events/${created.id}`),
    ]);
    expect(transactions).toEqual([]);
    expect(tickets).toEqual([]);
    expect(eventResponse.ok()).toBeTruthy();
    const eventBody = (await eventResponse.json()) as {
      Event?: { TicketsSold?: Record<string, number> };
      TicketsSold?: Record<string, number>;
    };
    const event = eventBody.Event ?? eventBody;
    expect(event.TicketsSold?.[ticketType.Id]).toBe(0);
  });
});
