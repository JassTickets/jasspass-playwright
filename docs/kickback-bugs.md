# Kickback findings from executable tests

Application bug fixes have not been made. A restricted testlab Stripe fixture endpoint was added separately for test setup. Findings 2–6 and 8 were reproduced in the retired local harness and remain historical evidence; their named C# reproduction cases are not part of current testlab CI coverage. This report separates failures in normal purchase flows from faults reproduced with deliberately inconsistent historical records. Multiple failing parameter cases can represent one defect.

## 1. Refunded sales retain wallet commission after real checkout

**Confirmed on testlab in USD, CAD and EUR.** The live referral test completed six Stripe test-card purchases: three promoter qualifying purchases and three referred purchases. Each referral earned 100 gross cents, 10 platform-fee cents and 90 wallet cents. The ledger reached `Completed` before cleanup began. All six orders subsequently became `CompletelyRefunded`, with tickets `RefundedBeforeEvent`, but each currency still advertised 90 available wallet cents and zero reversed cents.

Reproduction: `yarn test:kickback --grep 'one real promoter'`. The assertions for checkout, attribution, ledger and wallet display passed; financial teardown failed. A subsequent read confirmed the discrepancy, and the three test events were hidden while retaining their orders and ledger. [Sanitized event evidence](kickback-refund-evidence.json) includes the IDs for investigation. No withdrawal of those test earnings was requested.

The current source's [Stripe completion path](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Controllers/InternalController.cs:145) recalculates ticket totals and passes them to completion. The [ticket generator](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/TicketsService.cs:481) copies per-ticket commission amounts from those totals. The refund service sums those persisted allocations. A regression in `RefundAndRecoveryTests.Tickets_generated_from_webhook_recalculation_must_reverse_the_earned_commission_on_refund` exercises calculation → real ticket generation → commission processing → refund, without an external Stripe metadata write. All three isolated currency variants reproduced a zero-cent ticket allocation and unreversed commission after a completed refund. This specifically covers the boundary that fully populated accounting fixtures bypass.

## 2. Refund before the first commission record is created is lost

**Confirmed in isolated backend integration, four variants.** Refund one or both tickets of a funded order before the commission worker first runs. Later reconciliation creates the original unreversed commission. With a ready account it transfers the full original 1,800 cents even after a full refund; without onboarding it leaves inflated wallet earnings.

Reproduction: `RefundAndRecoveryTests.Refunded_tickets_must_not_become_payable_when_first_ledger_record_is_delayed`, ready/not-ready × partial/full refund. The [refund service](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/RefundsService.cs:428) returns when the payment record is absent. [First ledger creation](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/CommissionProcessingService.cs:363) subsequently uses the original transaction amounts without applying those earlier refunds. This is distinct from finding 1, which waits for the ledger before refunding.

## 3. Concurrent account creation sends conflicting credential emails

**Confirmed in isolated backend integration with a unique email index.** Eight concurrent confirmation requests created one user but produced eight credential-email payloads. The losing requests generate their own temporary passwords. The [generic provisioning catch](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PostCheckoutAccountService.cs:101) finds the winning account and sends the current request's password even though that request did not create the stored password hash.

Reproduction: `CheckoutAccountTests.Concurrent_confirmation_requests_create_one_user_and_one_credential_email(emailIndex: true)`. The one-user assertion passes; the one-email assertion fails. Email delivery is captured at the server boundary. Actual customer email delivery was not exercised by this fault test.

## 4. Account concurrency also requires a database uniqueness guarantee

**Confirmed for a fresh database without an email uniqueness index; deployed index state is unverified.** The same race creates duplicate users for one normalized email. A previous run observed eight distinct accounts; the latest run failed during a subsequent unique lookup with `Sequence contains more than one element`.

Reproduction: the same account-concurrency test with `emailIndex: false`. [Signup](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/AuthService.cs:106) checks then inserts. The harness uses the real repository/index registration. Check the deployed index and migration requirements before describing this as an existing testlab data problem; no such claim is established here.

## 5. Wallet reporting advertises money that withdrawal rejects

**Confirmed with deliberately inconsistent/legacy records, four variants.** Wallet-mode rows carrying a paid reference, a prior withdrawal-request timestamp, a negative reversal, or an inflated net amount are included in available balances. The real reservation filter correctly rejects them. Examples: the portal summary advertises 900, 901 or 1,001 cents while a request can reserve zero.

Reproduction: `ReportingTests.Advertised_wallet_availability_equals_the_amount_that_can_actually_be_reserved`. The [summary calculation](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Models/ValueObjects/PromoterSettlementSummary.cs:77) has fewer eligibility checks than withdrawal reservation. Valid, partially reversed and held controls pass. This does not prove that normal current writes produce the inconsistent combinations, or that extra money can be withdrawn.

## 6. Same-event historical currencies are added together

**Confirmed with an injected legacy/imported same-event currency mismatch, two variants.** A USD 900-cent row plus a CAD 900-cent row produces a single 1,800-cent USD event summary/statement. Currency totals across ordinary separate events pass.

Reproduction: `ReportingTests.Mixed_currency_history_must_not_be_summed_under_a_single_event_currency`. The [event summary](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/PromoterPaymentsService.cs:804) sums rows then chooses one currency; statement assembly similarly permits mixed rows. The test accepts explicit rejection as well as currency-safe output. It does not claim that ordinary event creation creates mixed-currency history.

## 7. Foreign payment-history access returns HTTP 500

**Confirmed on testlab and through the earlier isolated backend HTTP/authentication pipeline.** An authenticated attendee requesting another promoter's payment history receives 500 instead of 403. No foreign payment data is returned. Foreign stats, statements and promo-code controls pass with 404.

Current reproduction: `yarn test:kickback --grep "another authenticated user receives forbidden"` in `testlab_api.spec.ts`. Historical reproduction: `ReportingTests.Foreign_promoter_requests_are_denied_by_the_real_HTTP_pipeline(resource: "payments")`. [The controller](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Controllers/PrivateEventPromotersController.cs:394) passes the explanatory message to `Forbid(string)`, where ASP.NET interprets it as an authentication-scheme name.

## 8. Confirmation-email earnings estimates exceed the ticket cap

**Confirmed in two helper regression cases.** For a 10-dollar ticket with a capped gross commission of 10 dollars and a 10% platform fee, the maximum net is 9 dollars. The email estimate promises 18 dollars for a fixed 20-dollar commission, or 11.70 dollars for 80% plus 5 dollars. Actual checkout cap cases pass.

Reproduction: `NotificationTests.Email_offer_must_not_promise_more_than_the_ticket_commission_cap`. [The offer builder](/Users/christianjaimes/dev/jass/e2e/jasstickets-api/JassTicketsApi/Services/BuyerPromotionEmailOfferBuilder.cs:39) calculates the uncapped fee before estimating net earnings.

## Test issues corrected, not product findings

A concurrent admin recovery caller may see either a lease conflict or an already-recovered balance. The test now accepts both only while independently verifying one exact recovery. A removed live attribution record can be bypassed when an earned ledger already exists; separate tests now cover that case and the missing-source-before-ledger failure. Earlier browser failures caused by strict locators, profile prompts and ticket-fulfillment timing were corrected. None of these are counted as product bugs.

The latest testlab run also corrected three test assumptions: the organizer discount-code list excludes buyer codes by design; hiding an already-hidden event returns 304; and requesting a valid currency before a promoter profile exists returns 404. All three corrected cases passed their focused rerun. The new settlement tests currently fail their missing-deployment preflight (404), not a financial assertion; they have not created paid fixtures.
