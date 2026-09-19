import type { APIRequestContext, Page, Response } from '@playwright/test';
import { test, expect } from '../../fixtures/application';
import { JASS_TEST_URL, NEW_CONTACT_ADDRESS } from '../../constants';
import {
  scopeEventCreationToOrganizer,
  visibleModalShell,
} from '../../helpers/eventHelpers';
import { openEventPortalDestination } from '../../helpers/portalNavigationHelpers';

test.setTimeout(180_000);

const createdEvents = new WeakMap<Page, Promise<string | undefined>[]>();

// Exercise the deployed app, just like the other event tests. The shared owner
// fixture tags browser requests for the suite's integration-resource cleanup.
test.beforeEach(async ({ ownerPage, ownerIdentity }, testInfo) => {
  const pending: Promise<string | undefined>[] = [];
  createdEvents.set(ownerPage, pending);
  ownerPage.on('response', response => {
    if (response.request().method() !== 'POST' || !response.ok()) return;
    const url = new URL(response.url());
    if (url.origin !== new URL(JASS_TEST_URL).origin ||
      !/^\/api\/protected\/events(?:\/[^/]+\/draft)?\/?$/.test(url.pathname)) return;
    pending.push(response.json().then(body => body.Event?.Id ?? body.Id));
  });
  const restoreOrganizers = await scopeEventCreationToOrganizer(
    ownerPage,
    ownerIdentity.organizerId
  );
  try {
    await ownerPage.goto(`${JASS_TEST_URL}/portal/create-event`);
    await expect(ownerPage.getByPlaceholder('Event title')).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      ownerPage.getByRole('button', {
        name: ownerIdentity.organizerName,
        exact: true,
      })
    ).toBeVisible({ timeout: 30_000 });
  } finally {
    await restoreOrganizers();
  }
  await ownerPage.getByPlaceholder('Event title').fill(
    `PW Country ${testInfo.project.name} ${Date.now()}`
  );
  await ownerPage.getByRole('button').filter({ hasText: 'Set the location' }).click();
  await expect(locationSheet(ownerPage)).toBeVisible();
});

test.afterEach(async ({ ownerPage, ownerApi }) => {
  // Delete only this test's drafts/events, including the preparation draft if
  // publishing fails. The normal run-level cleanup remains a fallback.
  const ids = new Set(await Promise.all(createdEvents.get(ownerPage) ?? []));
  for (const id of ids) {
    if (!id) continue;
    const response = await ownerApi.delete(`/api/protected/events/${id}/delete`);
    expect(response.ok() || response.status() === 404,
      `Delete country test event ${id}: ${response.status()}`).toBeTruthy();
  }
});

function locationSheet(page: Page) {
  return visibleModalShell(page, 'Where is it?');
}

function canvasButton(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true }).filter({ visible: true });
}

async function enterManualLocation(page: Page, country = 'US') {
  const sheet = locationSheet(page);
  await sheet.getByRole('button', { name: 'Enter the address manually' }).click();
  await expect(sheet.getByLabel('Country', { exact: true })).toBeVisible({ timeout: 10_000 });
  await sheet.getByLabel('Street address').fill('123 Playwright Avenue');
  await sheet.getByLabel('City', { exact: true }).fill('Miami');
  await sheet.getByLabel('Postal code').fill('33101');
  await expect(sheet.getByLabel('Country', { exact: true })).toHaveValue('');
  await expect(sheet.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
  await sheet.getByLabel('Country', { exact: true }).selectOption(country);
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(sheet).toBeHidden();
}

async function expectOk(response: Response) {
  expect(response.ok(), `${response.status()}: ${await response.text()}`).toBeTruthy();
}

async function readEvent(api: APIRequestContext, id: string) {
  const response = await api.get(`/api/protected/events/${id}`);
  expect(response.ok(), `Read saved event: ${response.status()}`).toBeTruthy();
  const body = await response.json();
  return body.Event ?? body;
}

async function saveIncompleteDraft(page: Page, organizerId: string): Promise<string> {
  await expect(canvasButton(page, 'Publish')).toBeDisabled();
  const saved = page.waitForResponse(
    response => response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `/api/protected/events/${organizerId}/draft`,
    { timeout: 45_000 }
  );
  await canvasButton(page, 'Save draft').click();
  const response = await saved;
  await expectOk(response);
  const { Id } = await response.json();
  expect(Id).toBeTruthy();
  await expect(page).toHaveURL(new RegExp(`/event/${Id}(?:\\?|$)`), { timeout: 30_000 });
  return Id;
}

async function choosePlace(page: Page) {
  const search = page.getByPlaceholder('Search venue or address');
  const predictions = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/places-autocomplete'
  );
  await search.fill(NEW_CONTACT_ADDRESS);
  await expectOk(await predictions);
  // Use the same map-pin locator as the existing create-event helper; the
  // manual-entry action must not be mistaken for a Places suggestion.
  const suggestion = search.locator('xpath=../..').getByRole('button')
    .filter({ has: page.locator('svg.lucide-map-pin') }).first();
  await expect(suggestion).toBeVisible({ timeout: 15_000 });
  await suggestion.click();
}

test('manual country is required and retained when reopening the location', async ({ ownerPage }) => {
  await enterManualLocation(ownerPage);
  await ownerPage.getByRole('button').filter({ hasText: '123 Playwright Avenue' }).click();
  const sheet = locationSheet(ownerPage);
  await sheet.getByRole('button', { name: 'Correct the details' }).click();
  const country = sheet.getByLabel('Country', { exact: true });
  const done = sheet.getByRole('button', { name: 'Done', exact: true });
  await expect(country).toHaveValue('US');
  await country.selectOption('');
  await expect(done).toBeDisabled();
  await country.selectOption('CA');
  await sheet.getByLabel('City', { exact: true }).fill('Toronto');
  await done.click();
  await ownerPage.getByRole('button').filter({ hasText: '123 Playwright Avenue' }).click();
  await sheet.getByRole('button', { name: 'Correct the details' }).click();
  await expect(country).toHaveValue('CA');
  await expect(sheet.getByLabel('Street address')).toHaveValue('123 Playwright Avenue');
  await expect(sheet.getByLabel('City', { exact: true })).toHaveValue('Toronto');
});

test('manual country survives saving and reloading an incomplete draft', async ({ ownerPage, ownerApi, ownerIdentity }) => {
  await enterManualLocation(ownerPage);
  expect(ownerIdentity.countryIso).toBe('CA');
  const id = await saveIncompleteDraft(ownerPage, ownerIdentity.organizerId);
  await ownerPage.reload();
  expect(await readEvent(ownerApi, id)).toMatchObject({
    CountryIso: 'US', Address: '123 Playwright Avenue', City: 'Miami', ZipCode: '33101',
    IsIncomplete: true,
  });
  await openEventPortalDestination(ownerPage, 'eventDetails');
  await ownerPage.getByRole('button').filter({ hasText: '123 Playwright Avenue' }).click();
  const sheet = locationSheet(ownerPage);
  await sheet.getByRole('button', { name: 'Correct the details' }).click();
  await expect(sheet.getByLabel('Country', { exact: true })).toHaveValue('US');
});

test('publishes an event with the manually selected country', async ({ ownerPage, ownerApi }) => {
  await enterManualLocation(ownerPage);
  const image = await ownerApi.get('/gallery/photo1.jpg');
  expect(image.ok()).toBeTruthy();
  const chooser = ownerPage.waitForEvent('filechooser');
  await canvasButton(ownerPage, 'Add flyer').click();
  await (await chooser).setFiles({ name: 'photo1.jpg', mimeType: 'image/jpeg', buffer: await image.body() });
  await canvasButton(ownerPage, 'Add a ticket type').click();
  await ownerPage.locator('#tier-name:visible').fill('General Admission');
  await ownerPage.locator('#tier-price:visible').fill('10');
  await ownerPage.locator('#tier-quantity:visible').fill('10');
  await canvasButton(ownerPage, 'Add ticket type').click();
  const published = ownerPage.waitForResponse(response =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname.replace(/\/$/, '') === '/api/protected/events',
    { timeout: 90_000 }
  );
  await expect(canvasButton(ownerPage, 'Publish')).toBeEnabled({ timeout: 30_000 });
  await canvasButton(ownerPage, 'Publish').click();
  const response = await published;
  await expectOk(response);
  const { Event } = await response.json();
  expect(Event?.Id).toBeTruthy();
  expect(await readEvent(ownerApi, Event.Id)).toMatchObject({
    CountryIso: 'US', Address: '123 Playwright Avenue', City: 'Miami', IsVisible: true,
  });
});

test('autocomplete country and region survive a draft save', async ({ ownerPage, ownerApi, ownerIdentity }) => {
  const details = ownerPage.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/places-details'
  );
  await choosePlace(ownerPage);
  const response = await details;
  await expectOk(response);
  const place = await response.json();
  const region = place.addressComponents.find((component: { types: string[] }) =>
    component.types.includes('administrative_area_level_1')
  )?.longText;
  expect(region).toBeTruthy();
  const sheet = locationSheet(ownerPage);
  await sheet.getByRole('button', { name: 'Correct the details' }).click();
  await expect(sheet.getByLabel('Country', { exact: true })).toHaveValue('CA');
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();
  const id = await saveIncompleteDraft(ownerPage, ownerIdentity.organizerId);
  expect(await readEvent(ownerApi, id)).toMatchObject({ CountryIso: 'CA', StateProvince: region });
});

test('a failed Places lookup requires a manual country before saving', async ({ ownerPage, ownerApi, ownerIdentity }) => {
  // Only inject the third-party lookup failure. The deployed page, login,
  // organizer, event creation and readback all use the real application.
  await ownerPage.route('**/api/places-details?*', route => route.abort('failed'));
  await choosePlace(ownerPage);
  const sheet = locationSheet(ownerPage);
  await expect(sheet.getByLabel('Country', { exact: true })).toHaveValue('');
  await expect(sheet.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
  await sheet.getByLabel('Country', { exact: true }).selectOption('CA');
  await sheet.getByLabel('City', { exact: true }).fill('Toronto');
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();
  const id = await saveIncompleteDraft(ownerPage, ownerIdentity.organizerId);
  expect(await readEvent(ownerApi, id)).toMatchObject({ CountryIso: 'CA', City: 'Toronto' });
});
