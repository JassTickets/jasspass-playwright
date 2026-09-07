# Kickback, checkout accounts, and promoter settlement study

> Execution update: integration tests now target testlab only. The local backend experiment was retired; its results are historical evidence, not CI coverage. Existing organizer Stripe IDs will be reused through a restricted testlab fixture endpoint. See [current execution results](kickback-results.json) and [setup instructions](kickback-testing.md).


Studied 2026-09-07. This is the source-study baseline. New executable tests, results, findings and remaining gaps are recorded in [the test implementation report](kickback-testing.md). Scenario definitions are in [the matrix](/Users/christianjaimes/dev/jass/jasspass-playwright/docs/kickback-test-matrix.md), with the same cases in [JSON](/Users/christianjaimes/dev/jass/jasspass-playwright/docs/kickback-test-matrix.json).

## Scope and evidence

| Repository | Studied branch and immutable commit | Remote verification |
| --- | --- | --- |
| UI | `test`, `6bf50c6012eb9bffc3068c6a9101c904001c1d34` | Matches GitHub `refs/heads/test` at inspection |
| API | `test`, `d88499856dc5c0a9133d450c2ec60b9ca3bf3cb7` | Matches GitHub `refs/heads/test` at inspection |
| Playwright | `main`, `dd3ae6a` | Local baseline; remote was not refreshed |

The UI/API `main` branches are different from these `test` heads. Matching source to GitHub does not prove that a particular test or production deployment runs these commits. Deployment identity must be part of test preflight.

I traced current production code, recent commit history, existing tests, Next.js proxy routes, and frontend state transitions. I ran 210 existing frontend tests in 21 files, all passing. I also built a clean, tracked-source API snapshot at `d884998` in `/private/tmp` and ran 382 focused backend tests, all passing with zero skips. Backend compilation emitted existing warnings. The first .NET execution was blocked by the sandbox's local socket restriction; the subsequent permitted run passed. These are component/helper/controller/service tests, mostly using fakes; they do not demonstrate real Mongo transaction races, a deployed checkout, Google OAuth, Stripe onboarding, transfer settlement, or bank receipt.

No application source or existing Playwright tests were changed. The pre-existing Playwright README modification, API appsettings modification, and unrelated untracked files were left intact. No deployed purchase, withdrawal, refund, email, or admin operation was executed during this study. No claim is made that the live UX was visually exercised.

## What the recent commits introduced

| Period | UI / API commits | Relevant behavior |
| --- | --- | --- |
| Aug 10 | `45a5faea`, `a5b9005c` / `29ffd11` | Initial Kickback settings; legacy UI controls gated by `buyerPromotion=true` |
| Aug 30 | `15739f19`, `fa50f2a3` / `5006b17`, `1fd9ada`, `ca96c74`, `91ea276` | Buyer enrollment, explicit attribution, durable commission processing, settlement snapshots, refund allocation/recovery, notifications, admin operations |
| Sep 4 | `5882fe0f` / `780bfc5` | Promoter portal redesign and backend pagination |
| Sep 4–5 | `d3f40a14`, `dba2f53f`, `1d23c484`, `fb46c15c`, `6cb952e6` / `ce1e0cc`, `c680bcc`, `6660cfc` | Automatic guest account provisioning/session, profile step, checkout-email-bound auth UI, custom code availability, safe auth continuation |
| Sep 6 | `2aec40b7` / `e64f8e5` | Funded wallets replace organizer-direct settlement; explicit currency-specific withdrawal requests |
| Sep 7 | `6bf50c60` / `d884998` | Mongo-backed shared country policy, promoter country reservation/account reuse, stricter status contract, multi-currency aggregate safeguards, modal styling |

An older Sep 5 commit says payout setup opens a new tab. The current behavior supersedes that: incomplete onboarding uses the current tab; an already-ready dashboard normally opens a new tab. Tests must follow current code, not commit titles.

## Product behavior, with the important distinctions

Your understanding is substantially correct. Kickback is the buyer-facing name; backend concepts still use `BuyerPromotion` and `BuyerAutoPromote`, and some older descriptions say Auto-Promote. It coexists with organizer-assigned promoters.

Becoming a promoter and opening a Stripe account are separate actions. A buyer can accept Kickback, receive a personal event referral code/link, and earn funded commissions before Stripe onboarding. An organizer can also assign a promoter through the existing promo-code/attachment model. Both paths share the promoter identity and commission ledger.

An eligible Stripe sale made while the promoter is ready selects automatic settlement. A sale made while that account is missing, incomplete, or temporarily unverifiable selects wallet settlement. **Later onboarding does not sweep the old wallet.** The owner requests those earnings separately, one currency at a time. A promoter can therefore have automatic paid, automatic pending/failed, available wallet, held wallet, and reversed earnings concurrently.

“Paid” in this application means a platform-to-connected-account Stripe **transfer** was recorded. The implementation calls `TransferService`, not Stripe's bank `PayoutService`. A withdrawal success response means the request was accepted for processing, not that money reached a bank. Bank payout scheduling and conversion are downstream Stripe behavior, outside the app's current ledger proof.

## Checkout account and modal state machine

The current code has three principal paths: a new guest gets an account and session; an existing account used while logged out requires authentication; an already signed-in buyer keeps their session. The existing-account sign-in path is likely the scenario you were remembering. Google-only accounts are a distinct variant of that path.

| Buyer entering checkout | Completion/account result | Browser and next UX |
| --- | --- | --- |
| New email, guest | Backend provisions an active Attendee, random password, source transaction marker; sends temporary-password welcome email | Full confirmation requests a session for that exact account/transaction; proxy sets HttpOnly access cookie and removes token from JSON; Redux receives identity/profile |
| Existing local account, guest | `ExistingAccount`, no auto-session | Save-ticket/sign-in choice, then password sign-in with checkout email read-only; buyer may continue without signing in |
| Existing Google-only account, guest | `ExistingAccount`, no generated replacement password | Same account-ownership requirement; Google path must match checkout email; password login fails normally instead of crashing on a null hash |
| Already signed in | Frontend skips guest bootstrap | Existing session remains; eligibility still checks which user actually owns a qualifying ticket |
| Account already created by this same order, e.g. webhook won the race | Marker classifies it as created for this transaction | Retry may establish the session without recreating the user or resending the credential email |
| Account created by another order/flow | Marker differs | Existing-account path; no automatic session |
| Forwarded individual ticket URL | UI does not call automatic account bootstrap | Optional signup/sign-in path; this URL is not treated as the full buyer confirmation |

Source: [account provisioner and session service](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PostCheckoutAccountService.cs:43), [session marker check](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/AuthService.cs:209), [confirmation orchestration](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(client)/components/common/OrderConfirmationComponent.tsx:297>), [cookie proxy](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(server)/api/public/auth/post-checkout/account/route.ts:1>).

Provisioning belongs to purchase completion, not just the page: `CompleteTransactionAsync` generates tickets, marks completion, then attempts provisioning for `TransactionType.Online`. Failure is caught so it does not undo fulfilled tickets; the confirmation endpoint can retry. The provisioner accepts Complete, PartiallyRefunded, and Overpaid transactions and requires at least one active ticket with the purchaser's normalized email. Positive ticket amount is **not** a requirement for account creation, so a zero-total online order may create an account while being ineligible for Kickback. Non-online orders do not receive this automatic provisioning.

Ordinary signup attaches unclaimed tickets by email. Purchase recipient email versus purchaser email, multi-ticket holders, ticket sharing, signed-in buyers buying for somebody else, and ownership after transfer need explicit tests. Do not infer enrollment eligibility from a transaction's buyer name alone.

The confirmation page waits for persisted authentication initialization and nonempty ticket data. Ticket polling starts immediately and repeats after the preceding request completes. Account requests have four attempts, with 500/1000/2000 ms delays; 404, 408, 409, 425, 429 and 5xx are retryable, as are network failures. A terminal failure preserves tickets and displays recovery UI; it must not be recategorized as an existing account. Authentication opens profile completion before Kickback. The profile modal fetches the authoritative current profile and asks only for missing photo, Instagram, and DOB; dismissal or completion releases the offer. The global DOB prompt is deferred around checkout to avoid competing dialogs.

The guest can dismiss the sign-in choice, inspect the Kickback offer, enter a custom code, and accept promoter terms. Continuing then asks for authentication. The draft is held in React state; after auth and any profile step, the exact submitted code is checked again. Auto-submission is allowed once after a fresh available response. Editing cancels automatic continuation, including changing back to the old code. Canceling promotion authentication clears the draft; the Back action can return to the offer. A full reload does not promise to retain this in-memory draft.

Source: [flow predicates/retries](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(client)/utils/postCheckoutAccountFlow.ts:97>), [modal wiring](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(client)/components/common/OrderConfirmationComponent.tsx:877>), [locked sign-in](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(client)/components/common/PostCheckoutModals/SignInModal.tsx:158>), [auto-resume guard](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(client)/utils/buyerPromotionAutoResume.ts:1>).

## Enrollment, code, and organizer controls

New enrollment requires an existing event in state Ok, approved, visible, not ended, and with Kickback enabled; an active user; and an **owned, active, positive-amount ticket from the supplied confirmation for that event**. Event privacy is not independently rejected by the eligibility function. An existing active organizer-assigned relationship for the same event prevents a second buyer enrollment. A promoter active on another event, or with inactive organizer-assigned history, can qualify.

Eligibility returns ten explicit states: Eligible, ExistingBuyerPromotionActive, ExistingBuyerPromotionDisabled, ExistingBuyerPromotionRevoked, ExistingActiveEventPromoter, EventPromotionDisabled, EventUnavailable, EventEnded, UserUnavailable, NoQualifyingTicket. Only Eligible permits new enrollment. ExistingBuyerPromotionActive permits reopening sharing without another automatic sales offer. Existing disabled or revoked enrollment cannot be reactivated by the buyer. The acceptance endpoint has an idempotent early return for an existing active enrollment; it does not rerun all new-enrollment checks in that branch.

The buyer supplies a code and explicitly accepts promoter terms. The frontend uppercases input, removes diacritics/whitespace/disallowed characters, collapses repeated hyphens, and limits length to 24. API validation is authoritative: 3–24 characters, alphanumeric groups with internal single hyphens. Availability checks are public, debounced 500 ms, and **organizer-wide**. The code is usable only for its event, but another code with the same text anywhere under that organizer is a collision. A code is not reserved by a successful availability check.

Acceptance atomically creates/reuses a global `EventPromoter`, creates a `PromoCode` with Event scope and BuyerPromotion origin, and creates a `BuyerPromotionEnrollment`. Unique indexes constrain promoter/user, event/user enrollment, enrollment/code, organizer/code, and later transaction/commission. Enrollment freezes accepted terms/version and qualifying transaction. A personal Kickback code currently applies zero buyer discount. Share URLs contain `?promoCode=...`; event checkout applies/reapplies that parameter as quantities change. Sharing offers clipboard, WhatsApp, and native share when available. Tests should inspect link/clipboard behavior without sending messages.

My Tickets offers enrollment/sharing after authoritative eligibility checks. Confirmation emails deep-link to `/portal/my-tickets?promote=<eventId>`; the parameter is consumed once, including invalid/ineligible requests, to avoid reopening after dismissal. The email uses the least expensive purchased paid ticket for its estimate; the confirmation modal uses the first positive-amount ticket. Estimates for different sample tickets need not match each other, but each must be correctly calculated and labeled.

Source: [eligibility and acceptance](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/BuyerPromotionService.cs:117), [eligibility evaluation](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/BuyerPromotionService.cs:462), [modal code/auth/sharing](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(client)/components/common/PostCheckoutModals/BuyerPromotionModal.tsx:110>), [email offer](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/BuyerPromotionEmailOfferBuilder.cs:17).

Organizer settings support percentage, fixed amount per eligible ticket, or both. Percentage must be 0–100, fixed amount nonnegative, and enabling requires at least one nonzero component. Legacy create/edit surfaces still require `buyerPromotion=true` to show controls; Studio's Money edit surface exposes its own control. Tests should use the intended surface explicitly and ensure an unrelated edit preserves hidden settings.

Disabling the event switch stops new referral use immediately, then disables eligible enrollments/codes. Re-enabling prepares dependent state before exposing the enabled event. Re-sending identical settings repairs interrupted dependent writes. Revoked enrollments remain revoked. Commission edits update active/event-disabled enrollments for **future purchases**; existing transaction and ledger snapshots remain unchanged. Organizer revoke/reactivate keeps historical earnings and records audit information. Reactivation adopts the current event rate. Event duplication copies settings; it must not duplicate buyer enrollment, personal codes, balances, or payouts into the new event.

Source: [settings reconciliation](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/EventsService.cs:2842), [organizer enrollment controller](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Controllers/PrivateBuyerPromotionsController.cs:10), [legacy creation gate](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(client)/components/portal-components/event-portal/sub-components/create-event/CreateEvent.tsx:168>), [Studio edit](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(client)/components/studio/event-canvas/EditEventCanvas.tsx:779>).

## Financial contract and state transitions

At purchase initiation, the backend resolves at most one financial attribution: None, OrganizerAssigned, or BuyerAutoPromote. Buyer enrollment uses its own foreign key; it must not manufacture an organizer attachment ID. A self-referral is excluded by authenticated user ID **or** normalized checkout email, preventing sign-out from turning an own-code purchase into a commission.

The commission is calculated per eligible paid ticket from its final pre-tax ticket price after relevant discount, with fixed amount applied per eligible ticket. Free tickets, zero-priced custom tickets, vouchers, and complimentary purchases do not produce positive promoter earnings. Positive pay-what-you-want tickets can earn referral commission without discounting the buyer's selected amount. Mixed carts must allocate only eligible ticket amounts. Each ticket's gross is capped at that ticket's eligible price, and the order is capped at eligible subtotal.

Let `g` be rounded gross commission cents. Promoter platform fee cents are `clamp(floor(g × percentage / 100) + rounded fixed fee cents, 0, g)`. Net original earnings are gross minus platform fee. Gross is rounded away from zero for positive amounts. Largest-remainder allocation spreads gross and platform fee cents deterministically across tickets so their sums exactly match order cents. **The promoter platform fixed fee is applied to the gross order commission, not independently to every ticket.** The accepted event rate, platform rate, individual ticket allocations, attribution, funding, and payout destination are snapshots. Tests need independent expected amounts, not just equality between two endpoints that share the same calculation bug.

| Purchase-time condition | Transaction/initial ledger result | Money behavior |
| --- | --- | --- |
| No attribution or no positive gross | NotApplicable | No commission liability/transfer |
| Stripe collection supported, ready recipient | AutomaticProviderPayout + ProviderReady | Full gross collected; net transfer attempted after completion |
| Stripe collection supported, missing/incomplete recipient | Wallet | Full gross collected; no transfer until owner request |
| Stripe readiness lookup throws | Wallet + ProviderReadinessUnavailable | Earnings retained; purchase can proceed if collection is supported |
| Provider absent or cannot collect the commission | Request rejected | New unfunded commission must not be promised as withdrawable earnings |
| Net becomes zero after platform fee | Funded zero-net commission can be recorded | No positive transfer; test presentation and absence of withdrawal |

Only Stripe is currently registered for promoter payouts. The generic provider abstraction does not mean all payment rails support Kickback. In particular, the current wallet decision throws if collection is unavailable; older comments suggesting all rails always record commissions are not the current purchase-time contract.

Source: [attribution and self-referral](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PaymentsService.cs:1135), [per-ticket calculation](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PaymentsService.cs:1751), [funding decision and allocation](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PromoterSettlementService.cs:18), [platform fee](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Utils/TransactionUtils.cs:330).

There are separate state axes that tests must not conflate:

| Axis | Values / meaning |
| --- | --- |
| Entitlement | Active, PartiallyReversed, FullyReversed |
| Settlement mode | Wallet or AutomaticProviderPayout |
| Automatic transfer | NotApplicable, Pending, Processing, Paid, FailedRetryable, FailedNeedsReview |
| Risk | Clear or Held |
| Recovery of already-transferred money | NotApplicable, NotRequired, Pending, PartiallyRecovered, Recovered, FailedNeedsReview |
| Durable transaction processor | NotApplicable, Pending, Processing, Held, Completed, FailedRetryable, FailedNeedsReview |

Recording precedes payout. The processor claims a five-minute transaction lease, uses one ledger record per transaction, and retries the transfer with `promoter-transfer-<transactionId>`. Destination, currency, and first requested amount remain frozen across retry, even if account details, rates, refunds, or original attachment change later. After eight failures it escalates to review. An uncertain transfer first attempted 23 hours earlier is not resubmitted automatically. The original successful transfer remains Paid even if its entitlement is subsequently reversed and recovery fails.

Source: [processor](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/CommissionProcessingService.cs:199), [atomic payout claim](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PromoterPaymentsService.cs:981), [unique ledger indexes](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Repositories/PromoterPaymentRepository.cs:23).

## Wallet withdrawal contract

`POST /api/promoters/wallet/payouts?currencyIso=USD` derives the owner from the authenticated identity. The Next.js path contains a user ID but the proxy does not use it to select the wallet. Manipulating that path must never expose or withdraw another user's money; it may still act on the caller's own wallet, so a test should not blindly require 403 for that path alone.

The request accepts a three-letter currency, uppercases it, rechecks Stripe readiness, and claims entire eligible commission records. There is no client-selected withdrawal amount and no second transfer implementation. Eligible records must belong to the promoter and requested currency, be Wallet/Stripe, have Clear risk, no previous request, no paid timestamp/reference, positive remaining net, full gross funding, and consistent gross/net/reversal values. Case-insensitive currency matching is implemented.

Each record is atomically rechecked as it is claimed. A successful claim changes its ledger mode to AutomaticProviderPayout, freezes the current recipient account, records `WalletPayoutRequestedAtUtc`, and sets Pending. The **transaction retains its original Wallet snapshot**. Response 202 contains normalized currency, total reserved remaining cents, and commission count. It is not a single aggregated Stripe transfer: each underlying transaction is processed with its own stable transfer key.

No candidates gives 400; missing promoter gives 404; missing identity gives 401. Readiness/currency failures give 400. A request interrupted after some claims may return 500 while those claims remain durable: refresh before retry, and verify previously claimed rows cannot be claimed twice. New sales after candidate enumeration wait for the next request.

Reconciliation first requeues requested wallet rows, then processes eligible completed/refunded transactions. The default job interval is two minutes and the batch is 100. It is disabled in the API's Testing environment by registration, and can also be configured off. A deterministic integration fixture must invoke reconciliation explicitly or intentionally enable a shortened schedule in an isolated host. Waiting only for HTTP 202 is insufficient.

The portal uses server-wide currency aggregates, not the current ten-row ledger page, for available balance. It refreshes visible wallet state every 30 seconds, on focus, and on visibility changes; listeners/timers are cleaned up. Withdrawal feedback, busy/refresh disabled states, stale-data errors, and switching currencies during requests need browser tests.

Source: [wallet service](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PromoterWalletService.cs:25), [wallet endpoint](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Controllers/PrivateEventPromotersController.cs:24), [reconciliation](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PromoterCommissionReconciliationService.cs:20), [wallet UI](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(client)/components/portal-components/promoter-portal/PromoterWalletCard.tsx:35>).

## Stripe countries and independent geography dimensions

The shared source of truth is Mongo `StripeOnboardingCountries`, with required `CountryIso`, `Enabled`, and `DisplayOrder`. The policy reads enabled records on demand, normalizes and validates them, and has no hardcoded fallback. The index is case-insensitive and unique. An empty list disables new account choices; catalogue failure/invalid data fails closed. `DisplayOrder` is currently ignored; UI options sort by localized country name.

Organizers fetch `/api/stripe/onboarding-options` through the protected proxy. Promoters receive the same policy's new-account options through their onboarding-status response. Both render `StripeOnboardingCountrySelect`. The existing nine-country Playwright constant is a historical fixture set, **not proof of today's enabled Mongo catalogue**. No country records or actual enabled list were queried during this study.

The dimensions are: organizer business country, organizer Stripe account country, event country, event currency, promoter profile country, and promoter Stripe account country. They must remain distinct in fixture names and assertions. An unsupported profile country results in an empty explicit selection, not a silent US substitute. Existing promoter account country comes from stored provider details or Stripe, never from the profile. Promoters default selection only when the profile country appears in supported options.

A first promoter setup reserves its selected country before Stripe account creation. Creation uses `promoter-account-<userId>` for idempotency. Concurrent attempts selecting different countries cannot create competing accounts. Failed account-link creation should resume the saved account. A reserved setup older than 23 hours without a resolved account requires review. Existing or reserved accounts can resume after their country is removed from new-account options or the catalogue is unavailable; an existing account cannot change country through this flow.

Promoter readiness is `DetailsSubmitted && PayoutsEnabled && transfers == active`; `ChargesEnabled` is not required. Organizer sales readiness additionally requires `ChargesEnabled` and follows the organizer rule. Same country list does not mean identical account capabilities, setup UX, address requirements, or readiness. Organizers selecting a country different from their business country must supply an address in the selected account country; they cannot silently reuse their home address.

Source: [country policy](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/StripeOnboardingCountryPolicy.cs:7), [promoter reservation/status](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/EventPromotersService.cs:344), [readiness rules](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/StripeConnectAccountStatusService.cs:20), [organizer address policy](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/OrganizersService.cs:1184), [shared selector](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(client)/components/common/StripeOnboardingCountrySelect.tsx:15>).

## Currency, refund, portal, and operations invariants

Cross-event stats split both transaction and ledger rows by case-insensitive original currency, even within one attribution. CurrencyTotals, EventBreakdown, monthly series, selected-currency charts, and wallet requests must agree. USD from two event countries belongs in one USD bucket; USD/CAD/EUR from one promoter must never be added into an unlabeled money total. Number of transactions may be summed across currencies; monetary values may not. Historical event currency is protected against ordinary post-sale edits, while organizer business-country changes must not rewrite history.

Refund reversals use the **selected tickets' frozen net allocations**, not an order-price ratio. Refund request flags cannot opt out of promoter entitlement reversal. Before payout, reversal reduces eventual payout and creates no recovery debt. After the transfer amount is committed/paid, reversal records a recovery obligation. Recovery failure must not prevent the buyer refund; the ledger exposes the outstanding amount separately. Each refund has a stable reversal identity. A provider buyer refund that already reverses the organizer transfer must not also return commission funding to the organizer a second time; cash/outside-provider refund paths differ.

Promoter ledger pages and promo-code pages are backend paginated, normally ten rows; search has a 300 ms debounce and filter changes reset pages. Payments filter by entitlement status, currency, and search before pagination. Portal aggregate totals span all pages. Active relationships appear without earnings; detached/revoked history with earnings remains visible, including fully reversed earnings. Statement download is per promoter/event and is shared conceptually with the organizer's view. A promoter can have several organizer-assigned attachments/codes for an event, so totals cannot stop at the first attachment.

Admin operations include hold, release, retry payout, retry recovery, revoke enrollment, and reactivate enrollment, with reasons/audit and country scope. Ordinary promoters cannot perform admin operations; an organizer's authority is limited to authorized events. Notification failures are best-effort, and first-commission ownership is protected by a partial unique index. Browser tests need a captured-mail adapter/inbox fixture for welcome and commission messages, rather than sending to real buyers.

Source: [currency splitting](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PromoterPaymentsService.cs:607), [refund orchestration](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/RefundsService.cs:411), [settlement aggregates](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Models/ValueObjects/PromoterSettlementSummary.cs:66), [admin operations](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/AdminPromoterOperationsService.cs:106), [notifications](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PromoterNotificationService.cs:29).

## Targeted probes before treating the matrix as a passing contract

These are code-backed concerns, not reproduced deployed incidents. Tests should express the intended invariant and expose a failure if present, rather than approving the current discrepancy as expected behavior.

| Probe | Source observation | Required integration proof |
| --- | --- | --- |
| Google mismatch and server session | [Google proxy](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(server)/api/public/auth/google/route.ts:35>) sets the session before [SignInComponent](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(client)/components/common/Auth/SignInComponent.tsx:104>) rejects a mismatched email; required checkout email is not sent in that request | After mismatch, Redux, cookie-backed `/profile/me`, protected enrollment, and reload must agree on identity. An error message alone is not enough |
| Refund before first ledger insertion | [RefundsService](</Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/RefundsService.cs:427>) skips a missing ledger; [reconciliation candidates](</Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Repositories/TransactionRepository.cs:186>) include refunded transactions; recording later copies original financial snapshot | Delay first commission insert, refund tickets, then reconcile. Refunded net must never become payable. Test partial and full refunds, wallet and automatic decisions |
| Same-event mixed-currency statements | Cross-event aggregates split currencies, but [event stats](</Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PromoterPaymentsService.cs:804>) and [statement construction](</Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PromoterPaymentsService.cs:863>) choose one currency while summing rows | Ordinary multi-event statements must remain correct. For imported/legacy mixed-currency history within one event, require split output or explicit rejection rather than relabeling a sum |
| Email preview cap | [email builder](</Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/BuyerPromotionEmailOfferBuilder.cs:38>) does not apply the ticket-price gross cap used by checkout and [modal preview](</Users/christianjaimes/dev/jass/e2e/jasstickets-ui/app/(client)/utils/buyerPromotionPreview.ts:23>) | Configure fixed+percentage commission exceeding sample ticket price; the email must not promise more than the actual capped net |
| Displayed wallet eligibility vs request eligibility | [summary](</Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Models/ValueObjects/PromoterSettlementSummary.cs:82>) has fewer validity checks than [withdrawal filter](</Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PromoterWalletService.cs:69>) | In valid data both agree. Legacy/inconsistent rows must not show an amount as withdrawable when the endpoint rejects it |
| Money promises at provider boundaries | Readiness has no destination-currency guarantee; successful collection and Stripe transfer are separate operations | A ready account with a rejected currency transfer must retain a visible retry/review liability, not disappear or become falsely Paid |

Additional product boundary to record before asserting policy: the full confirmation endpoint can issue a session again for the same source transaction while the user remains active. It has no time cutoff in the studied service. Individual-ticket UI suppression does not itself establish an expiry policy for full confirmation links. Session-expiry/replay tests must separate the implemented rule from any desired stricter rule.

## How the new integration tests should be built

The current [event fixture](/Users/christianjaimes/dev/jass/jasspass-playwright/jasspass-tests/fixtures/application.ts:91) has no `buyerPromotionSettings` input. Its owner session is reused; buyer contexts are separate. The [confirmation assertion](/Users/christianjaimes/dev/jass/jasspass-playwright/jasspass-tests/helpers/criticalCheckoutHelpers.ts:312) dismisses a generic dialog after purchase. That helper must not be used to validate the new account/profile/Kickback sequence because it can hide a wrong or unexpected modal.

The old [country matrix](/Users/christianjaimes/dev/jass/jasspass-playwright/jasspass-tests/tests/critical_paths/country_currency_matrix.spec.ts:135) generates 9 organizer Stripe countries × 9 organizer business countries × 3 currencies = 243 cases. Promoter **profile** country is rotated through them. It assigns ordinary promoters and checks transaction attribution; it neither onboards a promoter account nor verifies actual promoter payout or wallet balance. Some unsupported event-settlement combinations are treated as expected rejection. These cases are useful prerequisites, not Kickback coverage.

Use four complementary execution levels:

1. **Playwright browser + API:** real UI/proxy/API/Mongo for account outcomes, modal sequence, enrollment, country selector, per-currency wallet, organizer controls, portal views, and a small set of full purchase-to-transfer/refund journeys. Use independent browser/API contexts for organizer, promoter, referral buyer, second buyer, and admin.
2. **Backend integration:** real repositories and Mongo replica-set transactions, deterministic fake payment/email/OAuth boundaries, and explicit reconciliation control. Exercise unique indexes, concurrent claims, crash windows, held/reversed rows, read/write filters, and exactly-once outcomes. Service fakes alone cannot prove atomic Mongo behavior.
3. **Stripe test-mode contracts:** real account creation/links, status, charge/application-fee funding, transfer, and reversal for required routing/currency combinations. Inspect provider objects/metadata as well as the Jass ledger. Keep payment mode unmistakably test-only and use disposable or leased test accounts.
4. **Existing unit/component tests:** exhaustive numerical boundaries, response parsing, code normalization, eligibility truth tables, locale sorting, reducer transitions, and UI error rendering. They make the expensive real-provider matrix smaller without removing financial invariants.

Required fixture additions: explicit Kickback settings; per-test new/local/Google-only users and captured credentials; independent promoter profile and Stripe account country; new/reserved/incomplete/ready/restricted account states; an isolated country-catalogue seed; immutable commission rate values or a preflight assertion of live values; a ledger/transfer observation helper; test-only provider fault controls; a reconciliation trigger inside the isolated test host; captured email data; and cleanup that accounts for money and queued work. No public production “mark paid” or user-controlled balance endpoints should be added for tests.

For every financial case assert all three boundaries: the buyer's fulfilled/refunded order; the promoter's ledger and currency summary; and the actual provider transfer/reversal when using real Stripe. Browser-only mocked responses should be labeled UI tests and must not count as money-movement integration coverage.

Polling must target states, with finite deadlines and useful diagnostics: ticket ready; account resolved; enrollment persisted; ledger recorded; withdrawal reserved; transfer Paid or explicit expected failure; recovery complete. Polling a visible toast is not sufficient. On failure capture case ID, tested commits/deployment IDs, event/transaction/enrollment/payment IDs, selected country/currency, last safe ledger response, and provider references, excluding session tokens, temporary passwords, and secrets.

Do not use the generic existing cleanup unchanged: it marks tickets inactive and deletes events, which does not prove commission funds were recovered. New payment fixtures must drain/resolve or deliberately preserve and report test liabilities before deleting related data. Retry attempts need distinct fixture identities or explicit reuse; otherwise retries can create duplicate users/codes or hide a duplicate transfer.

Google end-to-end identity cases need a deterministic test OAuth adapter at the server boundary plus a separately maintained real-Google smoke path if required. Returning a fabricated login response only in the browser misses the cookie mismatch probe. Stripe's test environment can permit some capability-dependent actions even when a capability is inactive, so assert Jass readiness predicates separately rather than inferring readiness from a test transfer alone. See [Stripe Connect testing](https://docs.stripe.com/connect/testing). Stripe can prune idempotency keys after at least 24 hours, which explains why the application uses a 23-hour review cutoff; an old uncertain transfer needs reconciliation, not a fresh key. See [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).

## Matrix expansion and implementation order

The companion matrix is a scenario catalogue with stable IDs, priorities, execution levels, preconditions, actions, expected results, variants, and code references. Rows with variants describe parameterized scenarios; the row count is not a claim about the eventual number of browser tests.

Run all defined checkout identity outcomes at one baseline supported currency and event. Cross the qualifying acquisition identities with no-account/incomplete/ready promoter states at the backend integration level. Cross both attribution types with wallet/automatic decisions, percentage/fixed/combined rates, and USD/CAD/EUR ledger currencies. For real Stripe, qualify every required account-country/currency tuple explicitly and report unsupported combinations as named negative cases. Do not treat a missing account, unfunded test balance, missing catalogue, or early return as successful coverage.

The country manifest must distinguish enabled onboarding countries from event-country/currency configuration and provider settlement capabilities. Compare the live seeded catalogue to an explicit expected fixture manifest so a removed country cannot silently shrink tests. Exercise every enabled option through the common policy and both UI selectors; use pairwise geography coverage for non-financial independence, but keep the full required promoter-account-country × transfer-currency financial contract set. USD/CAD/EUR are the current Playwright baseline, not a declaration that other configured currencies are supported by all providers or by the cent arithmetic.

Implement in this order: (1) isolated fixtures and the three account outcomes; (2) enrollment and referral attribution; (3) the mixed wallet/automatic lifecycle below; (4) real Stripe country/currency contracts and onboarding; (5) refunds, concurrent/crash processing, permissions, pagination, notifications, and the targeted probes. Keep fast browser cases separate from the slow real-provider suite; include a mobile viewport and Firefox/WebKit checks for auth persistence, dialogs, and popup navigation after Chromium establishes the main financial flow.

### Mandatory mixed lifecycle

Use one promoter and separate referral buyers. Configure three eligible events with distinct countries and USD, CAD, EUR; independently choose a verified promoter Stripe country capable of receiving the required test transfers. Initially that promoter has no Stripe account. Illustrative amounts below assume a 10% event commission and a 10% promoter platform fee with no fixed component; assert those fixture rates or derive independent expectations from the actual configured rate.

| Phase | Per currency | Required observations |
| --- | --- | --- |
| Before onboarding | One referred ticket at 100.00 | Gross 1000 cents, platform 100, net wallet 900; no transfer |
| After successful onboarding, before new sale | Same old rows | Wallet still 900; onboarding itself creates no payout request |
| New sale while ready | One referred ticket at 200.00 | Gross 2000, platform 200, net automatic 1800; paid reference appears; old wallet still 900 |
| Withdraw USD only | Request USD | Exactly old USD row reserved and then transferred; CAD/EUR wallets remain 900; USD lifetime net remains 2700 |
| Repeat USD request | No new wallet earnings | No duplicate transfer; empty-wallet rejection |
| Partially refund an unpaid CAD wallet order in a multi-ticket variant | Refund selected allocated ticket | CAD available decreases by its exact frozen net; no recovery debt for the unpaid portion |
| Withdraw remaining CAD and EUR | Separate currency requests | Only remaining eligible rows transfer; original currency/destination correct; no aggregate FX total |
| Refund an already paid sale | Reverse its selected ticket net | Original transfer remains recorded; entitlement and recovery state/totals update exactly once |

Add held, already-requested, failed-transfer, fully-reversed, and second-promoter rows to this fixture. Every view and withdrawal must exclude ineligible/foreign rows while preserving historical totals. Repeat with a promoter who is organizer-assigned on one event and a Kickback buyer on another.

Remaining environment facts to establish when implementing: deployed commit identities; actual Mongo country catalogue; disposable promoter test accounts and supported transfer currencies; test-mode platform balances; test-host reconciliation controls; a captured-mail/OAuth fixture; and the intended policy for the identified edge cases. These do not prevent planning or coding isolated tests, but they determine which real-provider cases can truthfully be reported as exercised.
