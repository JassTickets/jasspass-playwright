import { test, expect } from '../../fixtures/application';
import {
  applyPromoCode,
  assertOrderConfirmation,
  createUniqueBuyer,
  expectMoney,
  fillGuestContact,
  getApiArray,
  openCheckout,
  openEvent,
  selectTicketQuantity,
  submitPurchase,
  submitStripeCheckout,
  waitForTransaction,
  type PaymentTotals,
} from '../../helpers/criticalCheckoutHelpers';

type Transaction = {
  Confirmation: string;
  Status: string;
  Email: string;
  Quantity: number;
  DiscountCode?: string;
  DiscountPercentage?: number;
  AbsorbServiceFees: boolean;
  AbsorbTransactionFees: boolean;
};

type Ticket = {
  Confirmation: string;
  Status: string;
  Email?: string;
};

function expectAbsorbedFeeTotals(
  totals: PaymentTotals,
  expectedSubtotal: number,
  expectedTax: number,
  expectedTotal: number
) {
  expectMoney(totals.TotalServiceFee, 0);
  expectMoney(totals.TotalOrganizerFee ?? 0, 0);
  expectMoney(totals.TotalTransactionFee, 0);
  expectMoney(totals.TaxAmount, expectedTax);
  expectMoney(totals.TotalAmount, expectedTotal);
  expectMoney(
    Object.values(totals.Subtotals).reduce((sum, value) => sum + value, 0),
    expectedSubtotal
  );
}

test.describe('critical anonymous checkout paths', () => {
  test.setTimeout(180_000);

  test('uses backend pricing, applies a percentage promo, charges Stripe, and persists the order', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const promoCode = `PW10${Date.now().toString().slice(-7)}`;
    const ticketName = 'Absorbed Fee Admission';
    const created = await eventFactory.create({
      tickets: [{ type: ticketName, price: 40 }],
      promoCodes: [{ code: promoCode, discountPercentage: 10 }],
      taxRatePercentage: 10,
      absorbServiceFees: true,
      absorbTransactionFees: true,
    });
    const ticketType = created.ticketTypes[0];
    const buyer = createUniqueBuyer('Pricing');

    await openEvent(page, created.id, created.name);
    const initialCalculation = await selectTicketQuantity(
      page,
      created.id,
      ticketName,
      1
    );
    expectAbsorbedFeeTotals(
      initialCalculation.TotalWithoutPromoCode,
      40,
      4,
      44
    );
    expectMoney(
      initialCalculation.TotalWithoutPromoCode.Subtotals[ticketType.Id],
      40
    );

    const orderSummary = await openCheckout(page);
    await expect(orderSummary).toContainText(`${ticketName} (x1)`);
    await expect(
      orderSummary.getByText('$44.00', { exact: true })
    ).toBeVisible();
    await fillGuestContact(page, buyer);

    const discountedCalculation = await applyPromoCode(
      page,
      created.id,
      promoCode
    );
    expectAbsorbedFeeTotals(
      discountedCalculation.TotalWithPromoCode,
      36,
      3.6,
      39.6
    );
    expectMoney(
      discountedCalculation.TotalWithPromoCode.Subtotals[ticketType.Id],
      36
    );
    const originalTotal = page
      .getByText('$44.00', { exact: true })
      .filter({ visible: true });
    const discountedTotal = page
      .getByText('$39.60', { exact: true })
      .filter({ visible: true });
    await expect(originalTotal).toHaveCount(0);
    await expect(discountedTotal).toHaveCount(1);
    await expect(discountedTotal).toBeVisible();

    const purchase = await submitStripeCheckout(page);
    expect(purchase.ClientSecret).toBeTruthy();
    await assertOrderConfirmation(page, created.name, purchase.Confirmation);

    const transaction = await waitForTransaction<Transaction>(
      ownerApi,
      created.id,
      purchase.Confirmation
    );
    expect(transaction).toMatchObject({
      Status: 'Complete',
      Email: buyer.email,
      Quantity: 1,
      DiscountCode: promoCode,
      DiscountPercentage: 10,
      AbsorbServiceFees: true,
      AbsorbTransactionFees: true,
    });

    const tickets = await getApiArray<Ticket>(
      ownerApi.get(`/api/protected/events/${created.id}/tickets`),
      'Tickets'
    );
    expect(
      tickets.filter((ticket) => ticket.Confirmation === purchase.Confirmation)
    ).toEqual([
      expect.objectContaining({
        Confirmation: purchase.Confirmation,
        Status: 'Active',
        Email: buyer.email,
      }),
    ]);
  });

  test('completes a 100%-discount order without rendering or submitting Stripe card fields', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const promoCode = `PWFREE${Date.now().toString().slice(-6)}`;
    const ticketName = 'Promo to Zero Admission';
    const created = await eventFactory.create({
      tickets: [{ type: ticketName, price: 25 }],
      promoCodes: [{ code: promoCode, discountPercentage: 100 }],
      absorbServiceFees: true,
      absorbTransactionFees: true,
    });
    const buyer = createUniqueBuyer('FreePromo');

    await openEvent(page, created.id, created.name);
    await selectTicketQuantity(page, created.id, ticketName, 1);
    const orderSummary = await openCheckout(page);
    await fillGuestContact(page, buyer);

    const discountedCalculation = await applyPromoCode(
      page,
      created.id,
      promoCode
    );
    expectAbsorbedFeeTotals(discountedCalculation.TotalWithPromoCode, 0, 0, 0);
    const zeroTotals = orderSummary.getByText('$0.00', { exact: true });
    await expect(zeroTotals).toHaveCount(2);
    await expect(zeroTotals.first()).toBeVisible();
    await expect(page.locator('iframe[title*="card number" i]')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Proceed to Payment' })
    ).toHaveCount(0);

    const terms = page.locator('#tosAccepted:visible');
    await expect(terms).toHaveCount(1);
    await terms.check();
    const purchase = await submitPurchase(page, 'Checkout');
    expect(purchase.ClientSecret).toBeFalsy();
    await assertOrderConfirmation(page, created.name, purchase.Confirmation);

    const transaction = await waitForTransaction<Transaction>(
      ownerApi,
      created.id,
      purchase.Confirmation
    );
    expect(transaction).toMatchObject({
      Status: 'Complete',
      Email: buyer.email,
      Quantity: 1,
      DiscountCode: promoCode,
      DiscountPercentage: 100,
    });
  });
});
