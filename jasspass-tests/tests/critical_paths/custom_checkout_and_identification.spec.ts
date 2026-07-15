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

type CustomCheckoutResponse = {
  FieldLabel: string;
  Value: unknown;
};

type Transaction = {
  Confirmation: string;
  Status: string;
  Email: string;
  Quantity: number;
  CustomCheckoutDetails: CustomCheckoutResponse[];
};

type Ticket = {
  Confirmation: string;
  FirstName: string;
  LastName: string;
  Status: string;
};

test.describe('custom checkout and strict ticket identification', () => {
  test.setTimeout(120_000);

  test('validates every step and persists transaction fields plus distinct ticket holders', async ({
    page,
    eventFactory,
    ownerApi,
  }) => {
    const ticketName = 'Identified RSVP';
    const dietaryLabel = 'Dietary requirements';
    const consentLabel = 'I accept the attendee code';
    const dietaryValue = 'No peanuts';
    const created = await eventFactory.create({
      isFreeEvent: true,
      tickets: [{ type: ticketName, price: 0 }],
      strictTicketIdentification: true,
      customCheckoutItems: [
        {
          Kind: 'Text',
          Type: 'Text',
          Label: dietaryLabel,
          IsRequired: true,
          Order: 0,
          Placeholder: 'Enter dietary requirements',
        },
        {
          Kind: 'Checkbox',
          Type: 'Checkbox',
          Label: consentLabel,
          IsRequired: true,
          Order: 1,
        },
      ],
    });
    const buyer = createUniqueBuyer('CustomFields');

    await openEvent(page, created.id, created.name);
    await selectTicketQuantity(page, created.id, ticketName, 2);
    await openCheckout(page);
    await fillGuestContact(page, buyer);

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Ticket Holders', exact: true })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(
      page.getByText(
        'Please complete the required information for every ticket holder.',
        { exact: true }
      )
    ).toBeVisible();

    const holderFirstNames = page.getByPlaceholder('First Name', {
      exact: true,
    });
    const holderLastNames = page.getByPlaceholder('Last Name', {
      exact: true,
    });
    await expect(holderFirstNames).toHaveCount(2);
    await expect(holderLastNames).toHaveCount(2);
    await holderFirstNames.nth(0).fill('Ada');
    await holderLastNames.nth(0).fill('Lovelace');
    await holderFirstNames.nth(1).fill('Grace');
    await holderLastNames.nth(1).fill('Hopper');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    const dietaryInput = page.getByPlaceholder('Enter dietary requirements');
    await expect(dietaryInput).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(
      page.getByText('Please complete all required fields.', { exact: true })
    ).toBeVisible();

    await dietaryInput.fill(dietaryValue);
    await page
      .getByRole('checkbox', { name: new RegExp(consentLabel) })
      .check();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(purchaseButton(page, 'RSVP')).toBeEnabled();

    const purchaseRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().includes('/api/public/payments/purchase')
    );
    const purchase = await submitPurchase(page, 'RSVP');
    const purchaseRequest = await purchaseRequestPromise;
    const purchaseBody = purchaseRequest.postDataJSON() as {
      purchase: {
        tickets: Array<{
          quantity: number;
          ticketHolders: Array<{ firstName: string; lastName: string }>;
        }>;
      };
      CustomCheckoutDetails: Record<string, unknown>;
    };
    expect(purchaseBody.purchase.tickets).toEqual([
      expect.objectContaining({
        quantity: 2,
        ticketHolders: [
          { firstName: 'Ada', lastName: 'Lovelace' },
          { firstName: 'Grace', lastName: 'Hopper' },
        ],
      }),
    ]);
    expect(Object.values(purchaseBody.CustomCheckoutDetails)).toEqual(
      expect.arrayContaining([dietaryValue, true])
    );

    await assertOrderConfirmation(page, created.name, purchase.Confirmation);
    const transaction = await waitForTransaction<Transaction>(
      ownerApi,
      created.id,
      purchase.Confirmation
    );
    expect(transaction).toMatchObject({
      Status: 'Complete',
      Email: buyer.email,
      Quantity: 2,
    });
    expect(transaction.CustomCheckoutDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          FieldLabel: dietaryLabel,
          Value: dietaryValue,
        }),
        expect.objectContaining({ FieldLabel: consentLabel, Value: true }),
      ])
    );

    const tickets = await getApiArray<Ticket>(
      ownerApi.get(`/api/protected/events/${created.id}/tickets`),
      'Tickets'
    );
    const purchasedTickets = tickets.filter(
      (ticket) => ticket.Confirmation === purchase.Confirmation
    );
    expect(purchasedTickets).toHaveLength(2);
    expect(
      purchasedTickets
        .map((ticket) => `${ticket.FirstName} ${ticket.LastName}`)
        .sort()
    ).toEqual(['Ada Lovelace', 'Grace Hopper']);
    expect(purchasedTickets.every((ticket) => ticket.Status === 'Active')).toBe(
      true
    );
  });
});
