import { test, expect } from '@playwright/test';
import {
  selectFirstEventStartingWithPBO,
  duplicateEvent,
} from '../../helpers/eventHelpers';

test.setTimeout(120_000);

// @Description: This test verifies that event duplication functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.
test('duplicateEvent', async ({ page }) => {
  console.log('[INFO] Executing Duplicate Event test...');

  // Sign in and select first event starting with PBO
  const organizerPage = await selectFirstEventStartingWithPBO(page);

  // Duplicate the event
  await duplicateEvent(organizerPage);

  console.log('[INFO] Duplicate Event test completed successfully.');
});
