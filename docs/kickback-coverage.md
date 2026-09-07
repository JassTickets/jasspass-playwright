# Kickback implementation references

Recorded 2026-09-07. **This is an implementation index, not a full-coverage claim.** References cover only the assertions actually implemented, and every referenced row remains partial. A test title can cover fewer variants than the matrix row requires.

144 matrix rows; 66 with current Playwright references; 78 without. Retired local backend references have been moved to `historicalLocalTestReferences` in the JSON matrix and do not count as CI coverage.

See [execution results](kickback-results.json), [test instructions](kickback-testing.md), and [findings](kickback-bugs.md). The fixture routes are deployed. Both CI runs attempted all three settlement tests but the date-of-birth modal blocked checkout; the test handler is corrected locally. The focused US-account rerun completed automatic transfers and wallet withdrawals in all three currencies, then failed only refund reconciliation. CA/ES account cases have not been rerun since the correction.

## Rows without current Playwright references

- **AC-03** (P0, B): Existing Google-only account as guest
- **AC-06** (P0, I): Duplicate account creation race
- **AC-11** (P1, I): Provisioning transaction eligibility
- **AC-13** (P0, I): Buyer and holder identities
- **AC-15** (P1, B): Profile failure and dismissal
- **AC-17** (P1, I): Credential delivery failure boundary
- **AC-19** (P1, B): Terms and optional phone
- **AC-20** (P1, I): Full-confirmation replay policy
- **KB-09** (P0, I): Concurrent code claim
- **KB-10** (P1, B): Availability debounce and stale requests
- **KB-12** (P0, B): Guest draft resumes after Google auth
- **KB-13** (P0, B): Submitted code taken during auth
- **KB-14** (P0, B): Editing cancels auto-submit
- **KB-17** (P1, B): Referral link and quantity recalculation
- **KB-19** (P1, I): Enrollment transaction rollback
- **KB-20** (P1, B): Eligibility lookup fails closed
- **OR-02** (P1, B): Commission validation
- **OR-03** (P0, I): Disable and re-enable
- **OR-06** (P1, I): Duplicate event
- **OR-07** (P1, B): Hidden legacy fields preserve state
- **OR-08** (P1, I): Event ends or becomes unavailable
- **OR-09** (P1, I): Purchase initiated before settings change
- **OR-10** (P1, B): Organizer view and buyer promoter row
- **ST-02** (P0, I): Catalogue mutations and invalid data
- **ST-07** (P1, B): Ready dashboard navigation
- **ST-08** (P0, I): Concurrent account setup
- **ST-09** (P0, I): Failed link after account creation
- **ST-10** (P0, I): Existing country removed or catalogue outage
- **ST-15** (P0, B): Organizer cross-country address
- **ST-18** (P1, S): Provider restrictions after onboarding
- **CM-02** (P0, B): Own-code purchase earns nothing
- **CM-03** (P0, I): Percentage/fixed/combined calculation
- **CM-04** (P0, I): Eligible ticket composition
- **CM-05** (P0, I): Pay-what-you-want referral
- **CM-06** (P0, I): Rounding and caps
- **CM-07** (P0, S): Full gross collected in wallet and automatic modes
- **CM-08** (P0, I): Underfunded or unsupported provider
- **CM-09** (P0, I): Zero gross and zero net differ
- **CM-10** (P0, I): Snapshot invariance
- **CM-11** (P0, I): Duplicate webhook and lease ownership
- **CM-12** (P1, B): Code scope/revocation at checkout
- **WL-05** (P0, I): Eligibility filter excludes unsafe rows
- **WL-10** (P0, I): Refund/hold races candidate enumeration
- **WL-11** (P0, I): Request partially fails after claims
- **MC-03** (P0, I): Same currency across countries
- **MC-07** (P0, B): Selected-currency charts and wallet
- **MC-08** (P0, I): Post-sale country/currency immutability
- **MC-10** (P1, I): Unsupported or non-cent currency boundary
- **RF-02** (P0, I): Full refund before payout
- **RF-03** (P0, S): Refund after successful transfer
- **RF-04** (P0, I): Refund after amount claim before paid write
- **RF-05** (P0, I): Duplicate and sequential partial refunds
- **RF-06** (P0, I): Caller cannot opt out of promoter reversal
- **RF-07** (P0, I): Recovery failure does not block buyer
- **RF-08** (P0, I): Retry recovery by refund identity
- **RF-09** (P0, I): Organizer funding not returned twice
- **RF-10** (P0, I): Transient payout failure and retry
- **RF-11** (P0, I): Retry limits and uncertain transfer age
- **RF-12** (P0, I): Risk hold across processing
- **RF-13** (P0, I): Refund precedes first ledger insert probe
- **RF-14** (P1, I): Missing event/source during recovery
- **PV-01** (P0, B): Portal balances reconcile with complete ledger
- **PV-02** (P1, B): Payment search/filter pagination
- **PV-03** (P1, B): Promo-code pagination and performance
- **PV-06** (P0, B): Organizer authority boundaries
- **PV-07** (P0, I): Admin role and country scope
- **PV-09** (P1, B): Per-event statements
- **PV-10** (P0, I): Same-event mixed-currency reporting probe
- **PV-11** (P0, I): Wallet summary/request parity probe
- **PV-13** (P0, B): Google mismatch session probe
- **PV-14** (P1, B): No-promoter empty portal
- **NT-01** (P1, I): First commission notification exactly once
- **NT-02** (P1, I): Enrollment notification and link
- **NT-03** (P1, I): Payout success/failure and refund messages
- **NT-04** (P1, I): Email provider failure isolation
- **NT-05** (P0, I): Email estimate cap probe
- **NT-06** (P1, I): Reconciliation schedule/preflight
- **NT-07** (P0, S): Required provider cases cannot silently pass

Real Google OAuth, Stripe-hosted onboarding, incomplete account states, provider-failure injection, historical-data corruption and worker-controlled races remain gaps. Controlled portal responses are UI contracts, not proof of provider transfers. The new 9-tuple country/currency fixture does not replace the planned 54-tuple attribution/readiness/rate/currency expansion.

## Current test references

| Matrix row | Implementation | References |
| --- | --- | --- |
| AC-01 — New guest account and automatic session | partial | [checkout_identity.spec.ts:12](../jasspass-tests/tests/kickback/checkout_identity.spec.ts#L12) |
| AC-02 — Existing password account as guest | partial | [checkout_identity.spec.ts:36](../jasspass-tests/tests/kickback/checkout_identity.spec.ts#L36) |
| AC-03 — Existing Google-only account as guest | planned | No current Playwright reference |
| AC-04 — Already authenticated purchaser | partial | [signed_in_checkout.spec.ts:10](../jasspass-tests/tests/kickback/signed_in_checkout.spec.ts#L10) |
| AC-05 — Webhook completes before confirmation loads | partial | [checkout_identity.spec.ts:12](../jasspass-tests/tests/kickback/checkout_identity.spec.ts#L12) |
| AC-06 — Duplicate account creation race | planned | No current Playwright reference |
| AC-07 — Account bootstrap transient recovery | partial | [checkout_resilience.spec.ts:13](../jasspass-tests/tests/kickback/checkout_resilience.spec.ts#L13) |
| AC-08 — Bootstrap exhausted or nonretryable | partial | [checkout_resilience.spec.ts:31](../jasspass-tests/tests/kickback/checkout_resilience.spec.ts#L31) |
| AC-09 — Decline existing-account sign-in | partial | [checkout_resilience.spec.ts:48](../jasspass-tests/tests/kickback/checkout_resilience.spec.ts#L48) |
| AC-10 — Forwarded individual ticket URL | partial | [signed_in_checkout.spec.ts:23](../jasspass-tests/tests/kickback/signed_in_checkout.spec.ts#L23) |
| AC-11 — Provisioning transaction eligibility | planned | No current Playwright reference |
| AC-12 — Zero-total online account vs Kickback | partial | [checkout_identity.spec.ts:59](../jasspass-tests/tests/kickback/checkout_identity.spec.ts#L59) |
| AC-13 — Buyer and holder identities | planned | No current Playwright reference |
| AC-14 — Missing profile fields only | partial | [checkout_identity.spec.ts:12](../jasspass-tests/tests/kickback/checkout_identity.spec.ts#L12) |
| AC-15 — Profile failure and dismissal | planned | No current Playwright reference |
| AC-16 — Session persistence and identity consistency | partial | [checkout_identity.spec.ts:12](../jasspass-tests/tests/kickback/checkout_identity.spec.ts#L12) |
| AC-17 — Credential delivery failure boundary | planned | No current Playwright reference |
| AC-18 — Wrong password and verification | partial | [checkout_identity.spec.ts:36](../jasspass-tests/tests/kickback/checkout_identity.spec.ts#L36) |
| AC-19 — Terms and optional phone | planned | No current Playwright reference |
| AC-20 — Full-confirmation replay policy | planned | No current Playwright reference |
| KB-01 — Eligible buyer enrolls | partial | [checkout_identity.spec.ts:12](../jasspass-tests/tests/kickback/checkout_identity.spec.ts#L12); [testlab_api.spec.ts:47](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L47); [testlab_api.spec.ts:64](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L64) |
| KB-02 — Eligibility truth table | partial | [testlab_api.spec.ts:93](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L93) |
| KB-03 — Ticket proof boundaries | partial | [checkout_identity.spec.ts:59](../jasspass-tests/tests/kickback/checkout_identity.spec.ts#L59); [testlab_api.spec.ts:93](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L93) |
| KB-04 — Existing active buyer promotion | partial | [checkout_identity.spec.ts:12](../jasspass-tests/tests/kickback/checkout_identity.spec.ts#L12) |
| KB-05 — Existing active acceptance idempotency | partial | [testlab_api.spec.ts:47](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L47); [testlab_api.spec.ts:73](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L73) |
| KB-06 — Disabled/revoked buyer cannot self-reactivate | partial | [testlab_api.spec.ts:109](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L109) |
| KB-07 — Code normalization and boundaries | partial | [testlab_api.spec.ts:38](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L38) |
| KB-08 — Organizer-wide uniqueness vs event scope | partial | [testlab_api.spec.ts:47](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L47) |
| KB-09 — Concurrent code claim | planned | No current Playwright reference |
| KB-10 — Availability debounce and stale requests | planned | No current Playwright reference |
| KB-11 — Guest draft resumes after password auth | partial | [promotion_lifecycle.spec.ts:12](../jasspass-tests/tests/kickback/promotion_lifecycle.spec.ts#L12) |
| KB-12 — Guest draft resumes after Google auth | planned | No current Playwright reference |
| KB-13 — Submitted code taken during auth | planned | No current Playwright reference |
| KB-14 — Editing cancels auto-submit | planned | No current Playwright reference |
| KB-15 — Cancel, Back, close, and reload | partial | [checkout_resilience.spec.ts:48](../jasspass-tests/tests/kickback/checkout_resilience.spec.ts#L48); [promotion_lifecycle.spec.ts:12](../jasspass-tests/tests/kickback/promotion_lifecycle.spec.ts#L12) |
| KB-16 — My Tickets email deep link | partial | [promotion_lifecycle.spec.ts:35](../jasspass-tests/tests/kickback/promotion_lifecycle.spec.ts#L35) |
| KB-17 — Referral link and quantity recalculation | planned | No current Playwright reference |
| KB-18 — Sharing affordances | partial | [promotion_lifecycle.spec.ts:35](../jasspass-tests/tests/kickback/promotion_lifecycle.spec.ts#L35) |
| KB-19 — Enrollment transaction rollback | planned | No current Playwright reference |
| KB-20 — Eligibility lookup fails closed | planned | No current Playwright reference |
| OR-01 — Create/edit Kickback settings | partial | [testlab_api.spec.ts:163](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L163) |
| OR-02 — Commission validation | planned | No current Playwright reference |
| OR-03 — Disable and re-enable | planned | No current Playwright reference |
| OR-04 — Organizer revoke/reactivate | partial | [promotion_lifecycle.spec.ts:35](../jasspass-tests/tests/kickback/promotion_lifecycle.spec.ts#L35); [testlab_api.spec.ts:109](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L109) |
| OR-05 — Rate change preserves snapshots | partial | [testlab_api.spec.ts:109](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L109) |
| OR-06 — Duplicate event | planned | No current Playwright reference |
| OR-07 — Hidden legacy fields preserve state | planned | No current Playwright reference |
| OR-08 — Event ends or becomes unavailable | planned | No current Playwright reference |
| OR-09 — Purchase initiated before settings change | planned | No current Playwright reference |
| OR-10 — Organizer view and buyer promoter row | planned | No current Playwright reference |
| ST-01 — Shared enabled country options | partial | [promotion_lifecycle.spec.ts:61](../jasspass-tests/tests/kickback/promotion_lifecycle.spec.ts#L61) |
| ST-02 — Catalogue mutations and invalid data | planned | No current Playwright reference |
| ST-03 — Supported and unsupported profile default | partial | [portal_contract.spec.ts:106](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L106); [testlab_api.spec.ts:135](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L135) |
| ST-04 — Selected country independent of profile | partial | [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39) |
| ST-05 — Promoter account creation shape | partial | [promotion_lifecycle.spec.ts:61](../jasspass-tests/tests/kickback/promotion_lifecycle.spec.ts#L61); [testlab_api.spec.ts:135](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L135) |
| ST-06 — New/incomplete setup navigation | partial | [portal_contract.spec.ts:106](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L106) |
| ST-07 — Ready dashboard navigation | planned | No current Playwright reference |
| ST-08 — Concurrent account setup | planned | No current Playwright reference |
| ST-09 — Failed link after account creation | planned | No current Playwright reference |
| ST-10 — Existing country removed or catalogue outage | planned | No current Playwright reference |
| ST-11 — Existing account country authority | partial | [portal_contract.spec.ts:89](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L89) |
| ST-12 — Expired uncertain account creation | partial | [portal_contract.spec.ts:89](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L89) |
| ST-13 — Readiness truth table | partial | [portal_contract.spec.ts:106](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L106) |
| ST-14 — Onboarding status response validation | partial | [portal_contract.spec.ts:126](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L126) |
| ST-15 — Organizer cross-country address | planned | No current Playwright reference |
| ST-16 — Return from Stripe refreshes readiness | partial | [portal_contract.spec.ts:141](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L141) |
| ST-17 — Country list independent of currency catalogue | partial | [promotion_lifecycle.spec.ts:61](../jasspass-tests/tests/kickback/promotion_lifecycle.spec.ts#L61) |
| ST-18 — Provider restrictions after onboarding | planned | No current Playwright reference |
| CM-01 — Two attribution models share ledger | partial | [referral_currencies.spec.ts:14](../jasspass-tests/tests/kickback/referral_currencies.spec.ts#L14) |
| CM-02 — Own-code purchase earns nothing | planned | No current Playwright reference |
| CM-03 — Percentage/fixed/combined calculation | planned | No current Playwright reference |
| CM-04 — Eligible ticket composition | planned | No current Playwright reference |
| CM-05 — Pay-what-you-want referral | planned | No current Playwright reference |
| CM-06 — Rounding and caps | planned | No current Playwright reference |
| CM-07 — Full gross collected in wallet and automatic modes | planned | No current Playwright reference |
| CM-08 — Underfunded or unsupported provider | planned | No current Playwright reference |
| CM-09 — Zero gross and zero net differ | planned | No current Playwright reference |
| CM-10 — Snapshot invariance | planned | No current Playwright reference |
| CM-11 — Duplicate webhook and lease ownership | planned | No current Playwright reference |
| CM-12 — Code scope/revocation at checkout | planned | No current Playwright reference |
| WL-01 — Pre-onboarding funded wallet | partial | [portal_contract.spec.ts:8](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L8); [portal_contract.spec.ts:67](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L67); [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39) |
| WL-02 — Onboarding does not sweep wallet | partial | [portal_contract.spec.ts:8](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L8); [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39) |
| WL-03 — Withdraw selected currency | partial | [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39) |
| WL-04 — No client amount or foreign owner control | partial | [testlab_api.spec.ts:147](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L147) |
| WL-05 — Eligibility filter excludes unsafe rows | planned | No current Playwright reference |
| WL-06 — Empty or unavailable wallet | partial | [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39) |
| WL-07 — Currency input validation | partial | [testlab_api.spec.ts:147](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L147) |
| WL-08 — Incomplete or missing account cannot withdraw | partial | [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39); [testlab_api.spec.ts:172](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L172) |
| WL-09 — Concurrent/repeated withdrawal requests | partial | [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39) |
| WL-10 — Refund/hold races candidate enumeration | planned | No current Playwright reference |
| WL-11 — Request partially fails after claims | planned | No current Playwright reference |
| WL-12 — New sale during wallet request | partial | [portal_contract.spec.ts:8](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L8) |
| WL-13 — Wallet ledger changes but transaction does not | partial | [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39) |
| WL-14 — Durable request queue respects ongoing work | partial | [portal_contract.spec.ts:8](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L8) |
| WL-15 — Withdrawal transfers per underlying transaction | partial | [portal_contract.spec.ts:37](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L37); [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39) |
| WL-16 — Busy/error/refresh UI | partial | [portal_contract.spec.ts:37](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L37) |
| WL-17 — Wallet refresh lifecycle | partial | [portal_contract.spec.ts:51](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L51) |
| WL-18 — Currency switch during request | partial | [portal_contract.spec.ts:67](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L67) |
| MC-01 — Mandatory three-currency mixed lifecycle | partial | [referral_currencies.spec.ts:14](../jasspass-tests/tests/kickback/referral_currencies.spec.ts#L14); [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39) |
| MC-02 — Full settlement/arithmetic cross-product | partial | [portal_contract.spec.ts:8](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L8); [referral_currencies.spec.ts:14](../jasspass-tests/tests/kickback/referral_currencies.spec.ts#L14); [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39) |
| MC-03 — Same currency across countries | planned | No current Playwright reference |
| MC-04 — Different currencies within attribution history | partial | [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39) |
| MC-05 — Required promoter-country x transfer-currency manifest | partial | [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39) |
| MC-06 — Independent geography pairwise matrix | partial | [portal_contract.spec.ts:8](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L8) |
| MC-07 — Selected-currency charts and wallet | planned | No current Playwright reference |
| MC-08 — Post-sale country/currency immutability | planned | No current Playwright reference |
| MC-09 — Mixed wallet statuses in each currency | partial | [stripe_settlement.spec.ts:39](../jasspass-tests/tests/kickback/stripe_settlement.spec.ts#L39) |
| MC-10 — Unsupported or non-cent currency boundary | planned | No current Playwright reference |
| RF-01 — Partial refund before wallet withdrawal | partial | [referral_currencies.spec.ts:14](../jasspass-tests/tests/kickback/referral_currencies.spec.ts#L14) |
| RF-02 — Full refund before payout | planned | No current Playwright reference |
| RF-03 — Refund after successful transfer | planned | No current Playwright reference |
| RF-04 — Refund after amount claim before paid write | planned | No current Playwright reference |
| RF-05 — Duplicate and sequential partial refunds | planned | No current Playwright reference |
| RF-06 — Caller cannot opt out of promoter reversal | planned | No current Playwright reference |
| RF-07 — Recovery failure does not block buyer | planned | No current Playwright reference |
| RF-08 — Retry recovery by refund identity | planned | No current Playwright reference |
| RF-09 — Organizer funding not returned twice | planned | No current Playwright reference |
| RF-10 — Transient payout failure and retry | planned | No current Playwright reference |
| RF-11 — Retry limits and uncertain transfer age | planned | No current Playwright reference |
| RF-12 — Risk hold across processing | planned | No current Playwright reference |
| RF-13 — Refund precedes first ledger insert probe | planned | No current Playwright reference |
| RF-14 — Missing event/source during recovery | planned | No current Playwright reference |
| PV-01 — Portal balances reconcile with complete ledger | planned | No current Playwright reference |
| PV-02 — Payment search/filter pagination | planned | No current Playwright reference |
| PV-03 — Promo-code pagination and performance | planned | No current Playwright reference |
| PV-04 — Own promoter financial data | partial | [testlab_api.spec.ts:124](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L124); [testlab_api.spec.ts:172](../jasspass-tests/tests/kickback/testlab_api.spec.ts#L172) |
| PV-05 — Self-scoped proxy identity | partial | [signed_in_checkout.spec.ts:40](../jasspass-tests/tests/kickback/signed_in_checkout.spec.ts#L40) |
| PV-06 — Organizer authority boundaries | planned | No current Playwright reference |
| PV-07 — Admin role and country scope | planned | No current Playwright reference |
| PV-08 — Inactive historical relationships | partial | [promotion_lifecycle.spec.ts:35](../jasspass-tests/tests/kickback/promotion_lifecycle.spec.ts#L35) |
| PV-09 — Per-event statements | planned | No current Playwright reference |
| PV-10 — Same-event mixed-currency reporting probe | planned | No current Playwright reference |
| PV-11 — Wallet summary/request parity probe | planned | No current Playwright reference |
| PV-12 — Currency feedback and responsive dialogs | partial | [portal_contract.spec.ts:157](../jasspass-tests/tests/kickback/portal_contract.spec.ts#L157) |
| PV-13 — Google mismatch session probe | planned | No current Playwright reference |
| PV-14 — No-promoter empty portal | planned | No current Playwright reference |
| NT-01 — First commission notification exactly once | planned | No current Playwright reference |
| NT-02 — Enrollment notification and link | planned | No current Playwright reference |
| NT-03 — Payout success/failure and refund messages | planned | No current Playwright reference |
| NT-04 — Email provider failure isolation | planned | No current Playwright reference |
| NT-05 — Email estimate cap probe | planned | No current Playwright reference |
| NT-06 — Reconciliation schedule/preflight | planned | No current Playwright reference |
| NT-07 — Required provider cases cannot silently pass | planned | No current Playwright reference |
| NT-08 — Financial cleanup preserves evidence | partial | [referral_currencies.spec.ts:14](../jasspass-tests/tests/kickback/referral_currencies.spec.ts#L14) |
