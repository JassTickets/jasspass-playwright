import { test, expect } from '@playwright/test';
import {
  selectFirstEventStartingWithPBO,
  duplicateEventWithPromoCodes,
} from '../../helpers/eventHelpers';

test.setTimeout(180_000);

// @Description: This test verifies that event duplication with promo codes functionality works correctly.
// It first adds promo codes to an event, then duplicates the event and verifies the duplication was successful.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('duplicateEventWithPromoCodes', async ({ page }) => {
  console.log('[INFO] Executing Duplicate Event with Promo Codes test...');

  // Sign in and select first event starting with PBO
  const organizerPage = await selectFirstEventStartingWithPBO(page);

  // Duplicate the event with promo codes (this also adds promo codes first)
  await duplicateEventWithPromoCodes(organizerPage);

  console.log(
    '[INFO] Duplicate Event with Promo Codes test completed successfully.'
  );
});
