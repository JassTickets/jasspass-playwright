import { expect, test } from '../../fixtures/application';
import { JASS_TEST_URL } from '../../constants';

test('an organizer session and event list survive a hard refresh', async ({
  ownerPage,
  ownerIdentity,
  eventFactory,
}) => {
  const created = await eventFactory.create({ isFreeEvent: true });
  const organizerUrl = `${JASS_TEST_URL}/portal/organizer/company/${ownerIdentity.organizerId}?tab=events`;

  await ownerPage.goto(organizerUrl, { waitUntil: 'domcontentloaded' });
  await expect(ownerPage).not.toHaveURL(/\/signin(?:\?|$)/);

  const eventSearch = ownerPage.getByPlaceholder('Search Events');
  await expect(eventSearch).toBeVisible({ timeout: 30_000 });
  await eventSearch.fill(created.name);
  await expect(ownerPage.getByText(created.name, { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await ownerPage.reload({ waitUntil: 'domcontentloaded' });

  await expect(ownerPage).not.toHaveURL(/\/signin(?:\?|$)/);
  await expect(eventSearch).toBeVisible({ timeout: 30_000 });
  await eventSearch.fill(created.name);
  await expect(ownerPage.getByText(created.name, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
});
