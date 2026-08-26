import { test, expect } from '../../fixtures/application';

test.setTimeout(180_000);

test('deleteEvent', async ({ ownerApi, eventFactory }) => {
  console.log('[INFO] Executing Delete Event test...');
  const created = await eventFactory.create();
  const deleteResponse = await ownerApi.delete(
    `/api/protected/events/${created.id}/delete`
  );
  expect(deleteResponse.ok()).toBe(true);
  const deletedEventResponse = await ownerApi.get(
    `/api/public/events/${created.id}`
  );
  expect(deletedEventResponse.status()).toBe(404);
  console.log('[INFO] Delete Event test completed successfully.');
});
