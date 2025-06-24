import { Page } from '@playwright/test';

export async function fillIndividualStripeFields(page: Page) {
  const fieldOrder = [
    {
      expectedLabel: 'Credit or debit card number',
      value: '4242 4242 4242 4242',
    },
    {
      expectedLabel: 'Credit or debit card',
      value: '08 / 30',
    },
    {
      expectedLabel: 'Credit or debit card CVC/CVV',
      value: '444',
    },
  ];

  const allIframes = await page.locator('iframe').all();
  let fieldIndex = 0;

  for (const iframeElement of allIframes) {
    const frame = await iframeElement.contentFrame();
    if (!frame) continue;

    if (fieldIndex >= fieldOrder.length) break;

    const { expectedLabel, value } = fieldOrder[fieldIndex];
    const input = frame.getByRole('textbox', { name: expectedLabel });

    if (await input.count()) {
      console.log(`Filling field ${expectedLabel} with value ${value}`);
      await input.first().click({ force: true });
      await input.first().fill(value);
      fieldIndex++;
    }
  }

  if (fieldIndex < fieldOrder.length) {
    throw new Error(
      `Not all Stripe fields were filled. Stopped at index ${fieldIndex}`
    );
  }

  console.log('All Stripe fields filled successfully!');
}
