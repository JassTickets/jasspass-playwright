import { expect, Page } from '@playwright/test';

export async function fillIndividualStripeFields(page: Page) {
  await fillStripeField(
    page,
    'iframe[title*="card number" i]',
    /card number/i,
    '4242 4242 4242 4242'
  );
  await fillStripeField(
    page,
    'iframe[title*="expiration date" i]',
    /expiration date|expiry|credit or debit card/i,
    '08 / 30'
  );
  await fillStripeField(
    page,
    'iframe[title*="CVC" i]',
    /cvc|cvv/i,
    '444'
  );

  console.log('All Stripe fields filled successfully!');
}

async function fillStripeField(
  page: Page,
  frameSelector: string,
  inputName: RegExp,
  value: string
) {
  await expect(page.locator(frameSelector).first()).toBeVisible({
    timeout: 30000,
  });

  const input = page
    .frameLocator(frameSelector)
    .getByRole('textbox', { name: inputName })
    .first();

  await expect(input).toBeVisible({ timeout: 30000 });
  await input.fill(value);
}
