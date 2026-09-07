- Test Custom Checkout
- Test Promo Code discount amounts
- Test Fees Amount (create framework to test with taxes, with discount, with fees, absorbing fees, etc etc)
- Test Promoters & Verify that they get paid
- Test Partners & Verify that they get paid
- Test External Purchases (create, approve, reject)

## Kickback follow-ups

The items below retain outstanding findings from the earlier service investigation;
legacy-data and missing-index cases still need validation against deployed data.

- Preserve refund obligations when a refund arrives before its commission ledger record.
- Prevent duplicate credential emails during concurrent account creation; verify normalized-email uniqueness in the deployed database.
- Align wallet availability with withdrawal eligibility for inconsistent legacy records.
- Keep currencies separate in historical event summaries and statements.
- Cap commission estimates in buyer emails using the same calculation as checkout.
- Assess and repair previously issued tickets/refunds with missing commission allocations.
- Extend testlab coverage for Google OAuth, Stripe-hosted/incomplete onboarding, provider failures, and refund/payout races.
