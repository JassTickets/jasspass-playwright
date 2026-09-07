import { type APIRequestContext, type Page } from '@playwright/test';
import { test as kickback, expect } from '../../fixtures/kickback';
import { type CreatedEvent } from '../../fixtures/application';
import { getApiArray } from '../../helpers/criticalCheckoutHelpers';
import { json, ownProfile, promoterPath, purchase, uniqueBuyer, uniqueCode, waitForAccount,
  type BuyerProfile, type OrderTicket, type Promotion } from '../../helpers/kickbackHelpers';

type BuyerFixture = { page: Page; event: CreatedEvent; profile: BuyerProfile; confirmation: string; path: string };
const test = kickback.extend<{ ticketPrice: number; buyer: BuyerFixture }>({
  ticketPrice: [10, { option: true }],
  buyer: async ({ page, kickbackEvent, ownerApi, ticketPrice }, use) => {
    const event = await kickbackEvent({ isFreeEvent: ticketPrice === 0,
      tickets: [{ type: 'API contract admission', price: ticketPrice }] });
    const [, order] = await Promise.all([waitForAccount(page), purchase(page, event, uniqueBuyer('Api'), { free: ticketPrice === 0 })]);
    const profile = await ownProfile(page.request);
    await expect.poll(async () => {
      const tickets = await getApiArray<OrderTicket>(ownerApi.get(`/api/protected/events/${event.id}/tickets`), 'Tickets');
      return tickets.some(t => t.Confirmation === order.Confirmation && t.UserId === profile.Id && t.Status === 'Active');
    }, { timeout: 30_000, intervals: [500, 1_000, 2_000] }).toBe(true);
    await use({ page, event, profile, confirmation: order.Confirmation,
      path: promoterPath(profile.Id, `/events/${event.id}/buyer-promotion`) });
  },
});
test.setTimeout(180_000);

async function enroll(buyer: BuyerFixture, code = uniqueCode()) {
  return json<Promotion>(await buyer.page.request.post(buyer.path, { data: {
    Confirmation: buyer.confirmation, Code: code, AcceptedTerms: true,
  } }), 'Accept buyer promotion');
}

async function updateEvent(api: APIRequestContext, eventId: string, changes: Record<string, unknown>) {
  return api.put(`/api/protected/events/${eventId}`, { multipart: { eventId, request: JSON.stringify(changes) } });
}

test.describe('Real testlab enrollment API @testlab-api', () => {
  for (const code of ['AB', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '-HELLO', 'HELLO-', 'HELLO--WORLD', 'HELLO!']) {
    test(`[KB-07] rejects invalid code ${code} without creating enrollment`, async ({ buyer }) => {
      const response = await buyer.page.request.post(buyer.path, { data: {
        Confirmation: buyer.confirmation, Code: code, AcceptedTerms: true,
      } });
      expect(response.status()).toBe(400);
      expect((await buyer.page.request.get(buyer.path)).status()).toBe(404);
    });
  }

  test('[KB-01 KB-05 KB-08] normalized code is unique within its organizer and enrollment replay keeps the original identity', async ({ buyer, kickbackEvent, ownerApi }) => {
    const code = uniqueCode(); const first = await enroll(buyer, ` ${code.toLowerCase()} `);
    const replay = await enroll(buyer, uniqueCode());
    expect(first).toMatchObject({ Code: code, Status: 'Active', IsAlreadyPromoter: false });
    expect(first.AcceptedTermsVersion).toBeTruthy();
    expect(replay).toMatchObject({ Code: code, EnrollmentId: first.EnrollmentId, PromoCodeId: first.PromoCodeId, IsAlreadyPromoter: true });
    const other = await kickbackEvent();
    expect(other.organizerId).toBe(buyer.event.organizerId);
    const availability = await json<{ Available: boolean }>(await buyer.page.request.get(
      promoterPath(buyer.profile.Id, `/events/${other.id}/buyer-promotion/code-availability?code=${code.toLowerCase()}`)), 'Check organizer-wide code collision');
    expect(availability.Available).toBe(false);
    const codes = await getApiArray<{ PromoCode: { Id: string } }>(
      ownerApi.get(`/api/protected/organizers/${buyer.event.organizerId}/promocodes`), 'OrganizerPromoCodes');
    // Buyer codes intentionally do not appear in the organizer's editable discount-code list.
    expect(codes.map(c => c.PromoCode.Id)).not.toContain(first.PromoCodeId);
  });

  test('[KB-01] consent is required before the enrollment request can write a personal code', async ({ buyer }) => {
    const code = uniqueCode();
    expect((await buyer.page.request.post(buyer.path, { data: {
      Confirmation: buyer.confirmation, Code: code, AcceptedTerms: false,
    } })).status()).toBe(400);
    expect((await buyer.page.request.get(buyer.path)).status()).toBe(404);
    expect((await enroll(buyer, code)).Code).toBe(code);
  });

  test('[KB-05] concurrent enrollment submissions resolve to one persisted enrollment', async ({ buyer }) => {
    const code = uniqueCode();
    const responses = await Promise.all(Array.from({ length: 8 }, () => buyer.page.request.post(buyer.path, { data: {
      Confirmation: buyer.confirmation, Code: code, AcceptedTerms: true,
    } })));
    const accepted: Promotion[] = [];
    for (const response of responses) {
      expect([200, 409]).toContain(response.status());
      if (response.status() === 200) accepted.push(await response.json());
    }
    expect(accepted.length).toBeGreaterThan(0);
    expect(new Set(accepted.map(p => p.EnrollmentId)).size).toBe(1);
    expect(new Set(accepted.map(p => p.PromoCodeId)).size).toBe(1);
    expect(await json(await buyer.page.request.get(buyer.path), 'Read winning enrollment'))
      .toMatchObject({ EnrollmentId: accepted[0].EnrollmentId, Code: code });
    expect((await enroll(buyer, code)).EnrollmentId).toBe(accepted[0].EnrollmentId);
  });

  for (const [state, status] of [['hidden', 'EventUnavailable'], ['disabled', 'EventPromotionDisabled'],
    ['wrong-confirmation', 'NoQualifyingTicket'], ['wrong-owner', 'NoQualifyingTicket']] as const) {
    test(`[KB-02 KB-03] ${state} prevents enrollment despite a completed purchase`, async ({ buyer, ownerApi, ownerIdentity }) => {
      if (state === 'hidden') expect((await updateEvent(ownerApi, buyer.event.id, { IsVisible: false })).ok()).toBe(true);
      if (state === 'disabled') expect((await updateEvent(ownerApi, buyer.event.id,
        { BuyerPromotionSettings: { IsEnabled: false, Fee: { Percentage: 10, FixedAmount: 0 } } })).ok()).toBe(true);
      const api = state === 'wrong-owner' ? ownerApi : buyer.page.request;
      const userId = state === 'wrong-owner' ? ownerIdentity.userId : buyer.profile.Id;
      const path = promoterPath(userId, `/events/${buyer.event.id}/buyer-promotion`);
      const confirmation = state === 'wrong-confirmation' ? 'NOT-THIS-ORDER' : buyer.confirmation;
      expect(await json(await api.get(`${path}/eligibility?confirmation=${encodeURIComponent(confirmation)}`), 'Read eligibility'))
        .toMatchObject({ Status: status, CanEnroll: false });
      expect((await api.post(path, { data: { Confirmation: confirmation, Code: uniqueCode(), AcceptedTerms: true } })).status())
        .toBe(state.startsWith('wrong') ? 403 : 400);
      expect((await buyer.page.request.get(buyer.path)).status()).toBe(404);
    });
  }

  test('[KB-06 OR-04 OR-05] revocation blocks buyer re-enrollment and organizer reactivation adopts the current rate', async ({ buyer, ownerApi }) => {
    const enrolled = await enroll(buyer);
    const adminPath = `/api/protected/organizers/${buyer.event.organizerId}/events/${buyer.event.id}/buyer-promotions/${enrolled.EnrollmentId}`;
    expect((await ownerApi.post(`${adminPath}/revoke`)).ok()).toBe(true);
    expect((await buyer.page.request.post(buyer.path, { data: {
      Confirmation: buyer.confirmation, Code: uniqueCode(), AcceptedTerms: true,
    } })).status()).toBe(409);
    expect((await updateEvent(ownerApi, buyer.event.id,
      { BuyerPromotionSettings: { IsEnabled: true, Fee: { Percentage: 20, FixedAmount: 2 } } })).ok()).toBe(true);
    expect((await ownerApi.post(`${adminPath}/reactivate`)).ok()).toBe(true);
    expect(await json(await buyer.page.request.get(buyer.path), 'Read restored promotion'))
      .toMatchObject({ Status: 'Active', EnrollmentId: enrolled.EnrollmentId, Code: enrolled.Code,
        PromoCodeId: enrolled.PromoCodeId, Commission: { Percentage: 20, FixedAmount: 2 } });
  });

  test('[PV-04] another authenticated user receives forbidden for this promoter payment history', async ({ buyer, ownerApi, ownerIdentity }) => {
    await enroll(buyer);
    const profile = await json<{ EventPromoterId: string }>(await buyer.page.request.get(promoterPath(buyer.profile.Id, '/profile')), 'Read promoter ID');
    const response = await ownerApi.get(promoterPath(ownerIdentity.userId, `/${profile.EventPromoterId}/payments`));
    expect(response.status()).toBe(403);
  });
});

test.describe('Real testlab empty-wallet and onboarding API @testlab-api', () => {
  test.use({ ticketPrice: 0 });
  for (const country of ['', 'USA', 'U1', 'VE', 'ZZ']) {
    test(`[ST-03 ST-05] rejects unsupported onboarding country ${country || '(empty)'}`, async ({ buyer }) => {
      const path = promoterPath(buyer.profile.Id);
      const before = await json<{ HasAccount: boolean; SupportedCountryIsos: string[] }>(await buyer.page.request.get(`${path}/account/onboarded`), 'Read initial onboarding state');
      expect(before.HasAccount).toBe(false);
      expect(before.SupportedCountryIsos).not.toContain(country);
      expect((await buyer.page.request.post(`${path}/account/activate`, { data: { AccountCountryIso: country } })).status()).toBe(400);
      expect(await json(await buyer.page.request.get(`${path}/account/onboarded`), 'Read rejected onboarding state'))
        .toMatchObject({ HasAccount: false, Onboarded: false });
    });
  }

  for (const currency of ['', 'US', 'U5D', 'USD']) {
    test(`[WL-04 WL-07] empty unonboarded wallet cannot request ${currency || '(empty currency)'}`, async ({ buyer }) => {
      const path = promoterPath(buyer.profile.Id);
      expect(await json(await buyer.page.request.get(`${path}/profile`), 'Read absent promoter profile'))
        .toMatchObject({ EventPromoterId: null });
      // Malformed currencies fail validation; a valid currency reaches the missing-profile check.
      expect((await buyer.page.request.post(`${path}/wallet/payouts?currencyIso=${encodeURIComponent(currency)}`)).status())
        .toBe(currency === 'USD' ? 404 : 400);
      expect(await json(await buyer.page.request.get(`${path}/stats`), 'Read empty earnings')).toMatchObject({ CurrencyTotals: [] });
      expect(await json(await buyer.page.request.get(`${path}/account/onboarded`), 'Read untouched onboarding')).toMatchObject({ HasAccount: false });
    });
  }
});

test.describe('Real testlab settings and access API @testlab-api', () => {
  for (const fee of [{ Percentage: -1, FixedAmount: 0 }, { Percentage: 101, FixedAmount: 0 },
    { Percentage: 0, FixedAmount: -1 }, { Percentage: 0, FixedAmount: 0 }]) {
    test(`[OR-01] rejects invalid enabled commission ${fee.Percentage}% plus ${fee.FixedAmount}`, async ({ kickbackEvent, ownerApi }) => {
      const event = await kickbackEvent();
      expect((await updateEvent(ownerApi, event.id, { BuyerPromotionSettings: { IsEnabled: true, Fee: fee } })).status()).toBe(400);
    });
  }

  for (const [method, suffix] of [['GET', '/profile'], ['GET', '/stats'], ['GET', '/account/onboarded'],
    ['POST', '/account/activate'], ['POST', '/wallet/payouts?currencyIso=USD'],
    ['POST', '/events/000000000000000000000001/buyer-promotion']] as const) {
    test(`[PV-04 WL-08] anonymous ${method} ${suffix} cannot access promoter data or money actions`, async ({ request }) => {
      const response = await request.fetch(promoterPath('000000000000000000000001', suffix), {
        method, ...(method === 'POST' ? { data: {} } : {}),
      });
      expect([401, 403]).toContain(response.status());
    });
  }
});
