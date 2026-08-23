import { test, expect } from '../../fixtures/application';
import {
  openEventOrganizerPortal,
  sendMessageToAttendees,
} from '../../helpers/eventHelpers';
import { openEventPortalDestination } from '../../helpers/portalNavigationHelpers';

test.setTimeout(180_000);

// @Description: This test verifies that viewing event communications functionality works correctly.
// @Dependencies: Depends on the sign-in functionality and existing event being available.

test('viewEventCommunications', async ({ ownerPage, eventFactory }) => {
  console.log('[INFO] Executing View Event Communications test...');

  const created = await eventFactory.create({ isFreeEvent: true });
  const organizerPage = await openEventOrganizerPortal(ownerPage, created.id);

  // Generate a random test subject and body
  const randomSubject = `Test Email Subject ${Date.now()}`;

  await sendMessageToAttendees(organizerPage, randomSubject, randomSubject);
  await openEventPortalDestination(organizerPage, 'communications');

  const searchResponsePromise = organizerPage.waitForResponse((response) => {
    if (
      response.request().method() !== 'GET' ||
      !response.url().includes('/custom-emails')
    ) {
      return false;
    }
    return new URL(response.url()).searchParams.get('search') === randomSubject;
  });
  await organizerPage
    .getByRole('textbox', { name: 'Search emails...' })
    .fill(randomSubject);
  expect((await searchResponsePromise).ok()).toBeTruthy();

  const sentMessage = organizerPage.getByRole('heading', {
    name: randomSubject,
    exact: true,
  });
  await expect(sentMessage).toBeVisible({ timeout: 30_000 });
  await sentMessage.click();

  console.log('[INFO] View Event Communications test completed successfully.');
});
