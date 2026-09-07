import { type Page, type Route } from '@playwright/test';
import { ownProfile, promoterPath } from './kickbackHelpers';
import { JASS_TEST_URL } from '../constants';

export function settlement(available = 900, automaticPaid = 1800) {
  return {
    GrossCommissionCents: 3000, PlatformFeeCents: 300, OriginalNetCommissionCents: available + automaticPaid,
    ReversedNetCommissionCents: 0, NetCommissionCents: available + automaticPaid,
    AutomaticNetCommissionCents: automaticPaid, WalletNetCommissionCents: available,
    WalletAvailableNetCommissionCents: available, AutomaticPaidNetCommissionCents: automaticPaid,
    AutomaticPendingNetCommissionCents: 0, AutomaticFailedNetCommissionCents: 0,
    PayoutRecoveryOutstandingCents: 0, PayoutRecoveryFailedCount: 0,
    AutomaticCommissionCount: 1, WalletCommissionCount: 1,
  };
}

// A UI contract fixture: it exercises the deployed React portal with explicit API
// responses. It does not claim to transfer Stripe money or test server accounting.
export async function portalContract(page: Page) {
  const user = await ownProfile(page.request);
  const promoterId = '000000000000000000000091';
  const state = {
    statsError: false, statsRequests: 0, payouts: [] as string[],
    status: { HasAccount: true, AccountCountryIso: 'US' as string | null, Onboarded: true,
      SupportedCountryIsos: ['US', 'CA', 'ES'], CountrySelectionRequired: false },
    currencies: { USD: settlement(900, 1800), CAD: settlement(1234, 5678), EUR: settlement(2345, 6789) },
    payout: async (route: Route) => route.fulfill({ status: 202, json: { CurrencyIso: 'USD', AmountCents: 900, CommissionCount: 1 } }),
    activate: async (route: Route) => route.fulfill({ json: { url: `${JASS_TEST_URL}/__kickback_provider_test` } }),
  };
  await page.route(`**${promoterPath(user.Id)}/**`, async route => {
    const url = new URL(route.request().url());
    const suffix = url.pathname.slice(promoterPath(user.Id).length);
    if (suffix === '/profile') return route.fulfill({ json: { EventPromoterId: promoterId, PromoterDetails: [] } });
    if (suffix === '/account/onboarded') return route.fulfill({ json: state.status });
    if (suffix === '/account/activate') return state.activate(route);
    if (suffix === '/wallet/payouts') { state.payouts.push(url.searchParams.get('currencyIso')!); return state.payout(route); }
    if (suffix === '/stats') {
      state.statsRequests++;
      if (state.statsError) return route.fulfill({ status: 503, json: { message: 'Injected stats failure' } });
      return route.fulfill({ json: { EventPromoterId: promoterId, UserId: user.Id,
        FirstName: 'Contract', LastName: 'Promoter', Email: user.Email,
        CurrencyTotals: Object.entries(state.currencies).map(([CurrencyIso, SettlementSummary]) => ({
          CurrencyIso, SettlementSummary, TotalCommissionCents: SettlementSummary.NetCommissionCents, TotalTransactionCount: 2,
        })), EventBreakdown: [], MonthlyEarnings: [], LastCommissionAtUtc: null } });
    }
    if (suffix === '/promo-codes' || suffix === `/${promoterId}/payments`)
      return route.fulfill({ json: { Items: [], TotalCount: 0, Page: 1, PageSize: 10, TotalPages: 0, HasNextPage: false, HasPreviousPage: false } });
    throw new Error(`Unexpected promoter contract request: ${route.request().method()} ${suffix}`);
  });
  await page.context().route(`**/__kickback_provider_test`, route => route.fulfill({ contentType: 'text/html', body: '<h1>Controlled provider destination</h1>' }));
  return state;
}
