import { type APIRequestContext } from '@playwright/test';
import { test, expect } from '../../fixtures/application';
import { JASS_TEST_URL } from '../../constants';
import {
  applyPromoCode,
  assertOrderConfirmation,
  assertPurchaseSuccessUrl,
  createUniqueBuyer,
  fillGuestContact,
  getApiArray,
  openCheckout,
  openEvent,
  selectTicketQuantity,
  submitStripeCheckout,
  waitForTransaction,
} from '../../helpers/criticalCheckoutHelpers';
import {
  attachPromoter,
  compatibleEventCountry,
  createMatrixOrganizer,
  deleteEventBestEffort,
  deleteOrganizerBestEffort,
  ensurePromoterUser,
  expectApiSuccess,
  expectStripeProviderCountry,
  type MatrixCountry,
  type MatrixCurrency,
  type MatrixOrganizer,
  type MatrixTicket,
  type MatrixTransaction,
  MATRIX_COUNTRIES,
  MATRIX_CURRENCIES,
  nextCountry,
  readPublicEvent,
  refundTransaction,
  stripeAccountIdFor,
  updateEventCountryAndCurrency,
  updateOrganizerCountry,
} from '../../helpers/countryCurrencyMatrixHelpers';

type MatrixRefund = {
  TransactionId: string;
  TicketIds: string[];
  Complete: boolean;
};

const EXPECTED_LOCK_MESSAGES = {
  country: 'Cannot change the event country after tickets have been sold.',
  currency: 'Cannot change the event currency after tickets have been sold.',
} as const;

// Stripe's CountrySpec is authoritative for cross-currency settlement, but these
// home currencies are contractual invariants and must never take the rejection path.
const REQUIRED_HOME_CURRENCY: Partial<Record<MatrixCountry, MatrixCurrency>> = {
  US: 'USD',
  CA: 'CAD',
  PA: 'USD',
  ES: 'EUR',
  PT: 'EUR',
  DE: 'EUR',
};

async function expectRejectedChange(
  response: Awaited<ReturnType<typeof updateEventCountryAndCurrency>>,
  expectedMessage: string
) {
  const body = await response.text();
  expect(response.status(), body).toBe(400);
  expect(body).toContain(expectedMessage);
}

async function expectEventEconomics(
  api: APIRequestContext,
  eventId: string,
  countryIso: string,
  currencyIso: string
) {
  const event = await readPublicEvent(api, eventId);
  expect(event).toMatchObject({
    CountryIso: countryIso,
    CurrencyIso: currencyIso,
  });
}

function settlementRejectionMessage(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(
    "cannot be settled by this organizer's Stripe account"
  )
    ? message
    : undefined;
}

async function exerciseUnsoldCurrencyChange(
  api: APIRequestContext,
  eventId: string,
  targetCurrency: MatrixCurrency
): Promise<MatrixCurrency | undefined> {
  // Probe only the platform's three matrix currencies. Unsupported candidates are
  // expected product behavior; the first supported alternative exercises edit + restore.
  for (const candidate of MATRIX_CURRENCIES) {
    if (candidate === targetCurrency) continue;

    const candidateResponse = await updateEventCountryAndCurrency(
      api,
      eventId,
      { currencyIso: candidate }
    );
    const candidateBody = await candidateResponse.text();
    if (!candidateResponse.ok()) {
      expect(candidateResponse.status(), candidateBody).toBe(400);
      expect(candidateBody).toContain(
        `Currency '${candidate}' cannot be settled by this organizer's Stripe account`
      );
      continue;
    }

    const restoreResponse = await updateEventCountryAndCurrency(api, eventId, {
      currencyIso: targetCurrency,
    });
    await expectApiSuccess(
      restoreResponse,
      `Restore unsold event ${eventId} currency to ${targetCurrency}`
    );
    return candidate;
  }

  return undefined;
}

for (const stripeCountryIso of MATRIX_COUNTRIES) {
  test.describe(`country/currency matrix - Stripe ${stripeCountryIso}`, () => {
    test.describe.configure({ mode: 'serial' });
    test.setTimeout(240_000);

    let setupApi: APIRequestContext | undefined;
    let matrixOrganizer: MatrixOrganizer | undefined;
    const promoterEmails = new Map<string, string>();

    test.beforeAll(
      async ({ browserName, playwright, ownerIdentity, ownerStorageState }) => {
        test.setTimeout(180_000);
        if (browserName !== 'chromium') return;

        setupApi = await playwright.request.newContext({
          baseURL: JASS_TEST_URL,
          storageState: ownerStorageState,
        });
        matrixOrganizer = await createMatrixOrganizer(
          setupApi,
          ownerIdentity.userId,
          stripeCountryIso,
          stripeAccountIdFor(stripeCountryIso)
        );

        const refreshedStorageState = await setupApi.storageState();
        ownerStorageState.cookies = refreshedStorageState.cookies;
        ownerStorageState.origins = refreshedStorageState.origins;

        for (const promoterCountryIso of MATRIX_COUNTRIES) {
          promoterEmails.set(
            promoterCountryIso,
            await ensurePromoterUser(setupApi, promoterCountryIso)
          );
        }
      }
    );

    test.afterAll(async ({ browserName }) => {
      test.setTimeout(60_000);
      if (browserName !== 'chromium' || !setupApi) return;
      if (matrixOrganizer) {
        await deleteOrganizerBestEffort(setupApi, matrixOrganizer.organizerId);
      }
      await setupApi.dispose();
    });

    for (const [
      organizerIndex,
      organizerCountryIso,
    ] of MATRIX_COUNTRIES.entries()) {
      for (const [currencyIndex, currencyIso] of MATRIX_CURRENCIES.entries()) {
        const combinationIndex =
          organizerIndex * MATRIX_CURRENCIES.length + currencyIndex;
        const promoterCountryIso =
          MATRIX_COUNTRIES[combinationIndex % MATRIX_COUNTRIES.length];

        test(`organizer ${organizerCountryIso}, Stripe ${stripeCountryIso}, currency ${currencyIso}, promoter ${promoterCountryIso}`, async ({
          browserName,
          eventFactory,
          ownerApi,
          page,
        }) => {
          test.skip(
            browserName !== 'chromium',
            'The full payment matrix runs once in Chromium, not once per browser.'
          );
          expect(matrixOrganizer).toBeDefined();
          const organizer = matrixOrganizer!;
          const promoterEmail = promoterEmails.get(promoterCountryIso);
          expect(promoterEmail).toBeDefined();

          await updateOrganizerCountry(
            ownerApi,
            organizer,
            organizerCountryIso
          );

          const eventCountryIso = compatibleEventCountry(
            stripeCountryIso,
            organizerCountryIso
          );
          const initialEventCountryIso = compatibleEventCountry(
            stripeCountryIso,
            organizerCountryIso,
            1
          );
          const suffix = `${stripeCountryIso}${organizerCountryIso}${currencyIso}${Date.now().toString(
            36
          )}`;
          const promoCode = `MX${suffix}`.toUpperCase();
          const ticketTypeName = `Matrix ${currencyIso} Admission`;

          let created: Awaited<ReturnType<typeof eventFactory.create>>;
          try {
            created = await eventFactory.create({
              name: `PW Matrix ${stripeCountryIso}/${organizerCountryIso}/${currencyIso}`,
              organizer,
              eventCountryIso: initialEventCountryIso,
              currencyIso,
              tickets: [{ type: ticketTypeName, price: 20 }],
              promoCodes: [
                { code: promoCode, discountPercentage: 5, usageLimit: 5 },
              ],
              cleanup: false,
            });
          } catch (error) {
            const rejection = settlementRejectionMessage(error);
            if (!rejection) throw error;

            await expectStripeProviderCountry(ownerApi, organizer);
            expect(
              REQUIRED_HOME_CURRENCY[stripeCountryIso],
              `${stripeCountryIso} must always support its home matrix currency ${currencyIso}. ${rejection}`
            ).not.toBe(currencyIso);
            expect(rejection).toContain(`Currency '${currencyIso}'`);
            expect(rejection).toContain(`onboarded in ${stripeCountryIso}`);
            return;
          }

          try {
            await expectStripeProviderCountry(ownerApi, organizer);
            const countryChange = await updateEventCountryAndCurrency(
              ownerApi,
              created.id,
              { countryIso: eventCountryIso }
            );
            await expectApiSuccess(
              countryChange,
              `Change unsold event ${created.id} country`
            );

            const alternateSupportedCurrency =
              await exerciseUnsoldCurrencyChange(
                ownerApi,
                created.id,
                currencyIso
              );
            await expectEventEconomics(
              ownerApi,
              created.id,
              eventCountryIso,
              currencyIso
            );

            const promoterAttachmentId = await attachPromoter(
              ownerApi,
              organizer.organizerId,
              created.id,
              promoterEmail!
            );
            expect(promoterAttachmentId).not.toBe('');

            const buyer = createUniqueBuyer(
              `Matrix${stripeCountryIso}${organizerCountryIso}${currencyIso}`
            );
            await openEvent(page, created.id, created.name);
            await selectTicketQuantity(page, created.id, ticketTypeName, 1);
            await openCheckout(page);
            await fillGuestContact(page, buyer);
            await applyPromoCode(page, created.id, promoCode);
            const purchase = await submitStripeCheckout(page);
            await assertPurchaseSuccessUrl(
              page,
              created.id,
              purchase.Confirmation
            );
            await assertOrderConfirmation(
              page,
              created.name,
              purchase.Confirmation
            );

            const transaction = await waitForTransaction<MatrixTransaction>(
              ownerApi,
              created.id,
              purchase.Confirmation
            );
            expect(transaction).toMatchObject({
              Status: 'Complete',
              CurrencyIso: currencyIso,
              EventCountryIso: eventCountryIso,
              EventPromoterAttachmentId: promoterAttachmentId,
            });

            const tickets = await getApiArray<MatrixTicket>(
              ownerApi.get(`/api/protected/events/${created.id}/tickets`),
              'Tickets'
            );
            expect(
              tickets.filter(
                (ticket) => ticket.Confirmation === purchase.Confirmation
              )
            ).toEqual([expect.objectContaining({ Status: 'Active' })]);

            const temporaryOrganizerCountry = nextCountry(organizerCountryIso);
            await updateOrganizerCountry(
              ownerApi,
              organizer,
              temporaryOrganizerCountry
            );
            await updateOrganizerCountry(
              ownerApi,
              organizer,
              organizerCountryIso
            );

            await expectRejectedChange(
              await updateEventCountryAndCurrency(ownerApi, created.id, {
                countryIso: initialEventCountryIso,
              }),
              EXPECTED_LOCK_MESSAGES.country
            );
            if (alternateSupportedCurrency) {
              await expectRejectedChange(
                await updateEventCountryAndCurrency(ownerApi, created.id, {
                  currencyIso: alternateSupportedCurrency,
                }),
                EXPECTED_LOCK_MESSAGES.currency
              );
            }
            await expectEventEconomics(
              ownerApi,
              created.id,
              eventCountryIso,
              currencyIso
            );

            await refundTransaction(ownerApi, created.id, transaction, tickets);
            await expect
              .poll(
                async () =>
                  (
                    await waitForTransaction<MatrixTransaction>(
                      ownerApi,
                      created.id,
                      purchase.Confirmation
                    )
                  ).Status,
                { timeout: 45_000, intervals: [500, 1_000, 2_000] }
              )
              .toBe('CompletelyRefunded');

            const refunds = (
              await getApiArray<MatrixRefund>(
                ownerApi.get(`/api/protected/events/${created.id}/refunds`),
                'Refunds'
              )
            ).filter((refund) => refund.TransactionId === transaction.Id);
            expect(refunds).toEqual([
              expect.objectContaining({
                Complete: true,
                TransactionId: transaction.Id,
              }),
            ]);
          } finally {
            await deleteEventBestEffort(ownerApi, created.id);
          }
        });
      }
    }
  });
}

test.describe('event country/currency sold-inventory lock', () => {
  test.setTimeout(180_000);

  test('a full refund unlocks country and currency after sold inventory returns to zero', async ({
    browserName,
    eventFactory,
    ownerApi,
    page,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'The payment regression runs once in Chromium.'
    );

    const ticketTypeName = 'Historical Lock Admission';
    const created = await eventFactory.create({
      eventCountryIso: 'CA',
      currencyIso: 'USD',
      tickets: [{ type: ticketTypeName, price: 20 }],
    });
    const buyer = createUniqueBuyer('HistoricalEventLock');

    await openEvent(page, created.id, created.name);
    await selectTicketQuantity(page, created.id, ticketTypeName, 1);
    await openCheckout(page);
    await fillGuestContact(page, buyer);
    const purchase = await submitStripeCheckout(page);
    await assertPurchaseSuccessUrl(page, created.id, purchase.Confirmation);

    const transaction = await waitForTransaction<MatrixTransaction>(
      ownerApi,
      created.id,
      purchase.Confirmation
    );
    const tickets = await getApiArray<MatrixTicket>(
      ownerApi.get(`/api/protected/events/${created.id}/tickets`),
      'Tickets'
    );
    await refundTransaction(ownerApi, created.id, transaction, tickets);
    await expect
      .poll(
        async () =>
          (
            await waitForTransaction<MatrixTransaction>(
              ownerApi,
              created.id,
              purchase.Confirmation
            )
          ).Status,
        { timeout: 45_000, intervals: [500, 1_000, 2_000] }
      )
      .toBe('CompletelyRefunded');

    const countryChange = await updateEventCountryAndCurrency(
      ownerApi,
      created.id,
      { countryIso: 'US' }
    );
    await expectApiSuccess(
      countryChange,
      `Change fully refunded event ${created.id} country`
    );

    const currencyChange = await updateEventCountryAndCurrency(
      ownerApi,
      created.id,
      { currencyIso: 'CAD' }
    );
    await expectApiSuccess(
      currencyChange,
      `Change fully refunded event ${created.id} currency`
    );
    await expectEventEconomics(ownerApi, created.id, 'US', 'CAD');
  });
});
