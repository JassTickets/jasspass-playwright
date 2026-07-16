import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/application';
import {
  applyPromoCode,
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
  DiscountCode?: string;
  DiscountPercentage?: number;
};

type Ticket = {
  Confirmation: string;
  Status: string;
};

type PromoCodeAttachment = {
  EventId: string;
  TicketTypeId: string;
  UsageLimit: number;
  TimesUsed: number;
};

async function prepareDiscountedCheckout(
  page: Page,
  eventId: string,
  eventName: string,
  ticketName: string,
  promoCode: string,
  buyer: ReturnType<typeof createUniqueBuyer>
) {
  await openEvent(page, eventId, eventName);
  await selectTicketQuantity(page, eventId, ticketName, 1);
  await openCheckout(page);
  await fillGuestContact(page, buyer);
  const calculation = await applyPromoCode(page, eventId, promoCode);
  expect(calculation.TotalWithPromoCode.TotalAmount).toBe(0);
  await expect(
    page.getByText('$0.00', { exact: true }).filter({ visible: true }).first()
  ).toBeVisible();
  const terms = page.locator('#tosAccepted:visible');
  await expect(terms).toHaveCount(1);
  await terms.check();
  await expect(purchaseButton(page, 'Checkout')).toBeEnabled();
}

test.describe('promo-code usage integrity', () => {
  test.setTimeout(180_000);

  test('allows only one of two prepared checkouts to consume a single-use promo code', async ({
    page,
    browser,
    eventFactory,
    ownerApi,
    ownerIdentity,
  }) => {
    const ticketName = 'Single-use Promo Admission';
    const promoCode = `PWONCE${Date.now().toString().slice(-6)}`;
    const created = await eventFactory.create({
      tickets: [{ type: ticketName, price: 20, totalTickets: 10 }],
      promoCodes: [{ code: promoCode, discountPercentage: 100, usageLimit: 1 }],
      absorbServiceFees: true,
      absorbTransactionFees: true,
    });
    const ticketType = created.ticketTypes[0];
    const winningBuyer = createUniqueBuyer('PromoWinner');
    const staleBuyer = createUniqueBuyer('PromoStale');

    await prepareDiscountedCheckout(
      page,
      created.id,
      created.name,
      ticketName,
      promoCode,
      staleBuyer
    );

    const competingContext = await browser.newContext();
    const competingPage = await competingContext.newPage();
    await prepareDiscountedCheckout(
      competingPage,
      created.id,
      created.name,
      ticketName,
      promoCode,
      winningBuyer
    );
    const winningPurchase = await submitPurchase(competingPage, 'Checkout');
    expect(winningPurchase.ClientSecret).toBeFalsy();
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
      DiscountCode: promoCode,
      DiscountPercentage: 100,
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
      const body = response.request().postDataJSON() as {
        EventId?: string;
        PromoCode?: string;
      };
      return body.EventId === created.id && body.PromoCode === promoCode;
    });
    await purchaseButton(page, 'Checkout').click();
    const rejectedCalculation = await rejectedCalculationPromise;
    const expectedError = `${promoCode} has reached its usage limit!`;
    expect(rejectedCalculation.status()).toBe(400);
    expect(await rejectedCalculation.text()).toBe(expectedError);
    await expect(
      page.getByRole('alert').filter({ hasText: expectedError }).first()
    ).toBeVisible();
    expect(purchaseRequestCount).toBe(0);
    await expect(page).toHaveURL(new RegExp(`/event/${created.id}(?:\\?|$)`));

    const [transactions, tickets, attachments] = await Promise.all([
      getApiArray<Transaction>(
        ownerApi.get(`/api/protected/events/${created.id}/transactions`),
        'Transactions'
      ),
      getApiArray<Ticket>(
        ownerApi.get(`/api/protected/events/${created.id}/tickets`),
        'Tickets'
      ),
      getApiArray<PromoCodeAttachment>(
        ownerApi.get(
          `/api/protected/organizers/${ownerIdentity.organizerId}/promocodes/attachments?event=${created.id}`
        ),
        'Attachments'
      ),
    ]);
    expect(transactions).toEqual([
      expect.objectContaining({
        Confirmation: winningPurchase.Confirmation,
        Status: 'Complete',
        DiscountCode: promoCode,
      }),
    ]);
    expect(tickets).toEqual([
      expect.objectContaining({
        Confirmation: winningPurchase.Confirmation,
        Status: 'Active',
      }),
    ]);
    expect(
      attachments.filter(
        (attachment) =>
          attachment.EventId === created.id &&
          attachment.TicketTypeId === ticketType.Id
      )
    ).toEqual([
      expect.objectContaining({
        UsageLimit: 1,
        TimesUsed: 1,
      }),
    ]);
  });
});
