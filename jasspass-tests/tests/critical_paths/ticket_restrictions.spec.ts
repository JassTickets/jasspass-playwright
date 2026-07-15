import { test, expect } from '../../fixtures/application';
import { JASS_TEST_URL } from '../../constants';
import {
  openEvent,
  ticketRow,
} from '../../helpers/criticalCheckoutHelpers';

test.describe('hidden and access-controlled ticket restrictions', () => {
  test.setTimeout(90_000);

  test('requires a private link and valid access code, then enforces min/max quantity', async ({
    page,
    eventFactory,
  }) => {
    const ticketName = 'Private Code Admission';
    const accessCode = `ACCESS${Date.now().toString().slice(-5)}`;
    const created = await eventFactory.create({
      tickets: [
        {
          type: ticketName,
          price: 15,
          showInEventPage: false,
          accessCode,
          minTicketsPerPurchase: 2,
          maxTicketsPerPurchase: 3,
        },
      ],
      absorbServiceFees: true,
      absorbTransactionFees: true,
    });
    const ticketType = created.ticketTypes[0];
    expect(ticketType).toMatchObject({
      Type: ticketName,
      ShowInEventPage: false,
      HasAccessCode: true,
      MinTicketsPerPurchase: 2,
      MaxTicketsPerPurchase: 3,
    });

    await openEvent(page, created.id, created.name);
    await expect(page.getByText(ticketName, { exact: true })).toHaveCount(0);

    await page.goto(
      `${JASS_TEST_URL}/event/${created.id}?tickets=${ticketType.Id}`
    );
    const row = ticketRow(page, ticketName);
    await expect(row).toBeVisible({ timeout: 30_000 });
    const accessCodeInput = row.getByPlaceholder('Access Code');
    const unlockButton = row.getByRole('button', { name: 'Unlock' });
    await expect(accessCodeInput).toBeVisible();

    const invalidResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(
          `/api/public/ticket-types/${ticketType.Id}/access-code/validate`
        ) && response.url().includes('WRONG-CODE')
    );
    await accessCodeInput.fill('WRONG-CODE');
    await unlockButton.click();
    const invalidResponse = await invalidResponsePromise;
    if (invalidResponse.ok()) {
      const invalidPayload = await invalidResponse.json().catch(() => null);
      expect(invalidPayload).not.toEqual(
        expect.objectContaining({ Id: ticketType.Id })
      );
    } else {
      expect(invalidResponse.status()).toBeGreaterThanOrEqual(400);
    }
    await expect(accessCodeInput).toBeVisible();
    await expect(row.getByRole('button')).toHaveCount(1);

    const validResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(
          `/api/public/ticket-types/${ticketType.Id}/access-code/validate`
        ) && response.url().includes(encodeURIComponent(accessCode))
    );
    await accessCodeInput.fill(accessCode);
    await unlockButton.click();
    const validResponse = await validResponsePromise;
    expect(validResponse.ok()).toBeTruthy();
    expect(await validResponse.json()).toEqual(
      expect.objectContaining({ Id: ticketType.Id })
    );
    await expect(accessCodeInput).toHaveCount(0);

    const quantity = row.locator('span.w-6');
    const decreaseButton = row.getByRole('button').first();
    const increaseButton = row.getByRole('button').last();
    await expect(quantity).toHaveText('0');

    const minimumRequestPromise = page.waitForRequest(
      (request) => {
        if (
          request.method() !== 'POST' ||
          !request.url().includes('/api/public/payments/checkout')
        ) {
          return false;
        }
        const body = request.postDataJSON() as {
          EventId?: string;
          Purchases?: Array<{ TicketTypeId: string; Quantity: number }>;
        };
        return (
          body.EventId === created.id &&
          body.Purchases?.[0]?.TicketTypeId === ticketType.Id &&
          body.Purchases[0].Quantity === 2
        );
      }
    );
    await increaseButton.click();
    await minimumRequestPromise;
    await expect(quantity).toHaveText('2');

    await increaseButton.click();
    await expect(quantity).toHaveText('3');
    await expect(increaseButton).toBeDisabled();

    await decreaseButton.click();
    await expect(quantity).toHaveText('2');
    await decreaseButton.click();
    await expect(quantity).toHaveText('0');
    await expect(decreaseButton).toBeDisabled();
  });
});
