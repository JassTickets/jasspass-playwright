import { test, expect } from '../../fixtures/application';
import {
  duplicateEventWithPromoCodes,
  openEventOrganizerPortal,
} from '../../helpers/eventHelpers';

test.setTimeout(180_000);

// @Description: This test verifies that event duplication with promo codes functionality works correctly.
// It first adds promo codes to an event, then duplicates the event and verifies the duplication was successful.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('duplicateEventWithPromoCodes', async ({ ownerPage, eventFactory }) => {
  console.log('[INFO] Executing Duplicate Event with Promo Codes test...');

  const created = await eventFactory.create();
  const organizerPage = await openEventOrganizerPortal(ownerPage, created.id);

  // Duplicate the event with promo codes (this also adds promo codes first)
  const duplicatedPromoCode = await duplicateEventWithPromoCodes(organizerPage);
  await expect(duplicatedPromoCode).toBeVisible({ timeout: 30_000 });

  console.log(
    '[INFO] Duplicate Event with Promo Codes test completed successfully.'
  );
});
