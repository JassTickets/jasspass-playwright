import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test';
import { JASS_TEST_URL } from '../constants';
import { fillIndividualStripeFields } from './stripeHelpers';

export type Buyer = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type PaymentTotals = {
  Subtotals: Record<string, number>;
  TotalServiceFee: number;
  TotalOrganizerFee?: number;
  TotalTransactionFee: number;
  TaxAmount: number;
  TotalAmount: number;
};

export type CheckoutCalculation = {
  TotalWithoutPromoCode: PaymentTotals;
  TotalWithPromoCode: PaymentTotals;
  [key: string]: unknown;
};

export type PurchaseResult = {
  Confirmation: string;
  ClientSecret?: string | null;
  [key: string]: unknown;
};

export function createUniqueBuyer(label: string): Buyer {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  return {
    firstName: 'Playwright',
    lastName: label,
    email: `playwright+${label.toLowerCase()}-${suffix}@gmail.com`,
    phone: '+16467899045',
  };
}

function isCalculationForEvent(response: Response, eventId: string): boolean {
  if (
    response.request().method() !== 'POST' ||
    !response.url().includes('/api/public/payments/checkout')
  ) {
    return false;
  }

  try {
    const body = response.request().postDataJSON() as { EventId?: string };
    return body.EventId === eventId;
  } catch {
    return false;
  }
}

export function ticketRow(page: Page, ticketTypeName: string): Locator {
  return page
    .getByText(ticketTypeName, { exact: true })
    .first()
    .locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " rounded-lg ")][1]'
    );
}

export async function openEvent(
  page: Page,
  eventId: string,
  eventName: string
) {
  const navigationResponse = await page.goto(
    `${JASS_TEST_URL}/event/${eventId}`
  );
  expect(
    navigationResponse?.ok(),
    `Event page navigation failed with ${navigationResponse?.status()}.`
  ).toBeTruthy();
  await expect(
    page.getByRole('heading', { name: eventName }).first()
  ).toBeVisible({
    timeout: 30_000,
  });
}

export async function selectTicketQuantity(
  page: Page,
  eventId: string,
  ticketTypeName: string,
  quantity: number
): Promise<CheckoutCalculation> {
  if (quantity < 1) throw new Error('Ticket quantity must be at least 1.');

  const row = ticketRow(page, ticketTypeName);
  await expect(row).toBeVisible({ timeout: 30_000 });
  const increaseButton = row.getByRole('button').last();
  await expect(increaseButton).toBeEnabled();

  let calculation: CheckoutCalculation | undefined;
  for (let current = 0; current < quantity; current += 1) {
    const calculationResponsePromise = page.waitForResponse(
      (response) => isCalculationForEvent(response, eventId),
      { timeout: 30_000 }
    );
    await increaseButton.click();
    const calculationResponse = await calculationResponsePromise;
    expect(calculationResponse.ok()).toBeTruthy();
    calculation = (await calculationResponse.json()) as CheckoutCalculation;
  }

  if (!calculation) throw new Error('Checkout totals were not calculated.');
  return calculation;
}

export async function openCheckout(page: Page): Promise<Locator> {
  const checkoutButton = page.locator('[data-checkout-cta="true"]').first();
  await expect(checkoutButton).toBeEnabled();
  await checkoutButton.click();
  const summaryHeading = page.getByRole('heading', {
    name: 'Order Summary',
    exact: true,
  });
  await expect(summaryHeading).toBeVisible({ timeout: 15_000 });
  return summaryHeading.locator('..');
}

export async function fillGuestContact(page: Page, buyer: Buyer) {
  const firstName = page.locator('#FirstName:visible');
  const lastName = page.locator('#LastName:visible');
  const email = page.locator('#Email:visible');
  const phone = page.locator('#phone-input:visible');

  await expect(firstName).toHaveCount(1);
  await expect(lastName).toHaveCount(1);
  await expect(email).toHaveCount(1);
  await expect(phone).toHaveCount(1);
  await firstName.fill(buyer.firstName);
  await lastName.fill(buyer.lastName);
  await email.fill(buyer.email);
  await phone.fill(buyer.phone);
}

export async function applyPromoCode(
  page: Page,
  eventId: string,
  promoCode: string
): Promise<CheckoutCalculation> {
  const promoHeading = page
    .getByText('Do you have a Promo Code?', { exact: true })
    .filter({ visible: true });
  const promoInput = page
    .getByPlaceholder('Enter promo code')
    .filter({ visible: true });
  if ((await promoInput.count()) === 0) {
    await expect(promoHeading).toHaveCount(1);
    await promoHeading.click();
  }
  await expect(promoInput).toHaveCount(1);
  await expect(promoInput).toBeVisible();
  await promoInput.fill(promoCode);

  const calculationResponsePromise = page.waitForResponse(
    (response) => isCalculationForEvent(response, eventId),
    { timeout: 30_000 }
  );
  const applyButton = page
    .getByRole('button', { name: 'Apply', exact: true })
    .filter({ visible: true });
  await expect(applyButton).toHaveCount(1);
  await applyButton.click();
  const calculationResponse = await calculationResponsePromise;
  const calculationBody = await calculationResponse
    .text()
    .catch(() => '<response body unavailable>');
  expect(
    calculationResponse.ok(),
    `Promo calculation failed with ${calculationResponse.status()}: ${calculationBody}`
  ).toBeTruthy();
  const calculation = JSON.parse(calculationBody) as CheckoutCalculation;
  await expect(
    page
      .getByText('Promo Code Applied', { exact: true })
      .filter({ visible: true })
  ).toBeVisible();
  return calculation;
}

export function purchaseButton(
  page: Page,
  buttonName: 'Checkout' | 'RSVP'
): Locator {
  return page
    .locator('button:not([data-checkout-cta="true"])')
    .filter({ hasText: new RegExp(`^${buttonName}$`), visible: true });
}

export async function submitStripeCheckout(
  page: Page
): Promise<PurchaseResult> {
  await page.getByRole('button', { name: 'Proceed to Payment' }).click();
  await expect(
    page.getByRole('heading', { name: 'Payment Information' })
  ).toBeVisible({ timeout: 15_000 });
  await fillIndividualStripeFields(page);
  const terms = page.locator('#tosAccepted:visible');
  await expect(terms).toHaveCount(1);
  await terms.check();
  return submitPurchase(page, 'Checkout');
}

export async function submitPurchase(
  page: Page,
  buttonName: 'Checkout' | 'RSVP'
): Promise<PurchaseResult> {
  const purchaseResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/public/payments/purchase'),
    { timeout: 45_000 }
  );
  const submitButton = purchaseButton(page, buttonName);
  await expect(submitButton).toHaveCount(1);
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  const purchaseResponse = await purchaseResponsePromise;
  const responseBody = await purchaseResponse
    .text()
    .catch(() => '<response body unavailable>');
  expect(
    purchaseResponse.ok(),
    `Purchase failed with ${purchaseResponse.status()}: ${responseBody}`
  ).toBeTruthy();
  await page.waitForURL(/\/payment\/success\/event\/[^/]+\/[^/?]+(?:\?|$)/, {
    timeout: 45_000,
  });
  const confirmation = new URL(page.url()).pathname.split('/').pop() ?? '';
  expect(
    confirmation,
    'Success URL must contain an order confirmation.'
  ).not.toBe('');

  if (responseBody !== '<response body unavailable>') {
    const result = JSON.parse(responseBody) as PurchaseResult;
    expect(result.Confirmation).toBe(confirmation);
    return result;
  }

  return { Confirmation: confirmation };
}

export async function assertOrderConfirmation(
  page: Page,
  eventName: string,
  confirmation: string
) {
  const closeButton = page.getByRole('button', { name: 'Close' }).first();
  if (await closeButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await closeButton.click();
  }

  await expect(
    page.getByRole('heading', { name: 'Order Confirmed!', exact: true })
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(eventName, { exact: true }).first()
  ).toBeVisible();
  await expect(
    page.getByText(confirmation, { exact: true }).first()
  ).toBeVisible();
}

export async function getApiArray<T>(
  responsePromise: Promise<APIResponse>,
  property: string
): Promise<T[]> {
  const response = await responsePromise;
  const bodyText = await response.text();
  expect(
    response.ok(),
    `API read failed with ${response.status()}: ${bodyText}`
  ).toBeTruthy();
  const data = JSON.parse(bodyText) as unknown;
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const nested = (data as Record<string, unknown>)[property];
    if (Array.isArray(nested)) return nested as T[];
  }
  throw new Error(`Expected an array or an object containing "${property}".`);
}

export async function waitForTransaction<T extends { Confirmation: string }>(
  ownerApi: APIRequestContext,
  eventId: string,
  confirmation: string
): Promise<T> {
  let found: T | undefined;
  await expect
    .poll(
      async () => {
        const transactions = await getApiArray<T>(
          ownerApi.get(`/api/protected/events/${eventId}/transactions`),
          'Transactions'
        );
        found = transactions.find(
          (transaction) => transaction.Confirmation === confirmation
        );
        return found?.Confirmation;
      },
      { timeout: 30_000, intervals: [500, 1_000, 2_000] }
    )
    .toBe(confirmation);
  return found!;
}

export function expectMoney(actual: number, expected: number) {
  expect(actual).toBeCloseTo(expected, 2);
}
