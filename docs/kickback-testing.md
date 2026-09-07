# Kickback tests against testlab

All integration tests delivered in this Playwright repository run against `https://testlab-env191.jasspass.com`. No local API, Mongo database, Docker container, Colima VM, or .NET harness is required. The earlier local backend experiment has been removed from the deliverable; its results remain historical bug evidence and **do not count as CI coverage**.

## CI/CD selection

All three test workflows select the same complete set of Playwright projects:

| Job | Projects |
| --- | --- |
| E2E Tests | `chromium`, `firefox`, `webkit` |
| Stripe Matrix Tests | `country-currency-matrix` |
| Seating Integ Tests | `seating-integration` |
| Kickback Tests | `kickback` |

Updated workflows are in the Playwright repository (`.github/workflows/playwright.yml`), UI repository (`.github/workflows/vercel-test-cicd.yml`) and API repository (`.github/workflows/deploy-test.yml`). Discovery currently includes all 56 spec files (462 project-test instances), including 73 Kickback cases. Each job explicitly sets `JASS_TEST_URL` to testlab, uses the lockfile, and retains HTML reports plus traces/screenshots on failure. Matrix jobs use `fail-fast: false` so a failing suite does not cancel the others. The API's Playwright jobs wait for both the server and edge-worker deployments. Existing application unit-test jobs remain separate.

The workflows are deployed. Both application CI runs executed all 73 Kickback tests in attempt 2: UI had 68 passes and 5 failures; API had 66 passes and 7 failures. Deployment workflows check out the Playwright repository's default branch, so test fixes must be pushed there before rerunning application CI. See [the recorded job links and failure classifications](kickback-results.json).

## Run the same tests locally

```sh
yarn install --frozen-lockfile
npx playwright install --with-deps
yarn test:kickback:typecheck
CI=true JASS_TEST_URL=https://testlab-env191.jasspass.com yarn test:testlab --reporter=line,html
```

For Kickback only:

```sh
CI=true JASS_TEST_URL=https://testlab-env191.jasspass.com yarn test:kickback --reporter=line,html
```

`test:kickback:integration` is an alias for the same deployed Playwright suite. Every `.spec.ts` under the Kickback directory is discovered automatically; there is no individual test allowlist. The common Playwright `baseURL` and existing helpers use `JASS_TEST_URL`. Kickback uses one worker through its package script/CI and zero retries so money failures are visible without creating duplicate paid fixtures.

## What the Kickback suite exercises

- Real checkout, account/session cookies, ticket ownership, enrollment, code sharing, revocation/reactivation, and testlab's background reconciliation.
- Real API requests for invalid codes and consent, enrollment replay/concurrency, organizer-wide code uniqueness, eligibility, rate updates, unsupported onboarding countries, empty-wallet requests and access control. These scenarios have been ported from local service tests to public/protected testlab endpoints.
- Real Stripe test-card referrals in USD, CAD and EUR, the actual commission ledger and currency-specific wallet display. Refund cleanup checks that liabilities disappear; the known refund regression remains a failing assertion.
- Deployed portal UI behavior for mixed wallet/automatic balances, withdrawal errors, onboarding navigation and malformed responses. Sixteen `@ui-contract` cases control promoter API responses to exercise UI states. They are not evidence of real provider transfers. Checkout resilience cases similarly inject selected response failures while keeping the underlying purchase real.

Events and buyers are unique to each test. Cleanup refunds paid tickets, cancels free tickets, hides events, and preserves financial parents/history. It reports remaining commission liabilities rather than deleting records to conceal them. Reports and traces may contain authenticated test sessions; use the private repository's artifact access controls.

## Remaining coverage and testlab support

Selecting every test in CI is distinct from implementing every planned scenario. See [the current reference index](kickback-coverage.md), [results](kickback-results.json), and [findings](kickback-bugs.md).

The new fixture endpoint handles attaching an existing test Stripe account only; it does not add general data-seeding or worker-control capabilities. The old local tests included provider failures, Mongo transaction rollback, malformed historical records and time-controlled reconciliation races. Those cannot be ported by changing a URL: testlab currently exposes no scenario-seeding, provider-failure injection or worker-control API for them. They remain explicit coverage gaps until equivalent testlab fixtures/controls are available; no placeholder skips are counted as passing tests.

## Reuse existing organizer Stripe accounts

`stripe_settlement.spec.ts` declares three required promoter account countries (US, CA, ES), each with USD, CAD and EUR referral earnings: nine required country/currency tuples. It obtains account IDs from the existing `stripeAccountIdFor` helper. No additional promoter login credentials or Stripe secret in Playwright/CI is required; each case creates its buyer through a real free checkout and uses that authenticated session.

The setup sequence is:

1. Create a fresh buyer, a source organizer owned by that buyer, and qualifying event purchases.
2. Earn wallet commissions in USD, CAD and EUR; verify withdrawal is rejected before account setup.
3. Attach the source organizer's existing Stripe account through the restricted testlab fixture route; repeat the request to check idempotency and verify another account cannot overwrite it.
4. Earn new automatic commissions in each currency while the original wallet remains available.
5. Withdraw each old wallet through the real portal, wait for provider transfer references, reject duplicate requests and verify other currencies and original transaction snapshots remain unchanged.
6. Refund the sales and require commission reversal/recovery through the shared financial cleanup.

Assertions use fresh promoter, event, transaction, commission and transfer IDs, never the balance of the shared Stripe destination. No mocked payout response, automatic skip, fallback account, or skipped currency can satisfy these tests.

### Fixture endpoint and deployment

API: `POST /api/promoters/testlab/stripe-connect/{organizerId}` in `KickbackTestlabController.cs`.
UI proxy: `POST /api/protected/users/{id}/promoter/testlab/stripe-connect/{organizerId}`. A read-only GET on the same proxy forwards to `GET /api/promoters/testlab/status`, verifying both deployments before paid fixtures are created.

The API requires a non-production environment, the configured HTTPS testlab frontend host, Stripe test credentials, and the existing `CanUpdatePsp` representative permission on the source organizer. It resolves the promoter from the session, reads the account ID from that organizer, checks real Stripe readiness/country, and atomically attaches only when no payout account or onboarding reservation exists. It does not change commissions or Stripe account settings. Repeating the same attachment is allowed; replacing an existing account is rejected. The UI forwards neither a client user ID nor an account ID/readiness value.

The API's 16 focused tests and the proxy's 12 tests pass in their existing unit-test projects. Those checks use fakes and do not require a database. Existing API/UI CI unit-test commands discover them automatically.

**Both fixture routes are deployed.** The latest application CI jobs passed their preflight, then all three settlement cases were blocked by the optional date-of-birth modal during paid checkout. The settlement test now installs the existing shared prompt handler before purchases. The account helper also captures responses before checkout while starting its account-response deadline after checkout completes, fixing the two additional premature timeouts in API CI. The focused rerun passed both checkout cases. The US settlement case completed automatic transfers and wallet withdrawals in all three currencies, then failed only refund reconciliation. CA/ES account cases and the full suite have not been rerun after these corrections. Transfer evidence and outcomes are recorded in [results](kickback-results.json).

Actual Stripe-hosted onboarding, incomplete-account states and provider currency eligibility remain separately tracked. Reusing ready organizer accounts cannot establish those behaviors. The existing refund defect may also cause settlement-test cleanup to fail after otherwise successful transfers.
