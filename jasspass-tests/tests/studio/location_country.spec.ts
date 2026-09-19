import { test, expect, type Page } from '@playwright/test';
import { buildStudioLocationHarness } from '../../helpers/studioLocationHarness';

// Component integration: actual modal, controls and submit hook, mocked API/Places/uploads.
// No deployed environment, account credentials or real event creation required.
let bundle: string;
test.beforeAll(async () => { bundle = await buildStudioLocationHarness(); });
test.beforeEach(async ({ page }) => {
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle });
  await page.getByRole('button', { name: 'Enter the address manually' }).waitFor();
});

async function manualLocation(page: Page, country = 'CA') {
  await page.getByRole('button', { name: 'Enter the address manually' }).click();
  await expect(page.getByLabel('Country', { exact: true })).toBeVisible();
  await page.getByLabel('Street address').fill('123 Test Street');
  await page.getByLabel('City', { exact: true }).fill('Toronto');
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
  await page.getByLabel('Country', { exact: true }).selectOption(country);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
}

test('manual country is required, saved, and retained when reopening', async ({ page }) => {
  await manualLocation(page, 'US');
  expect(await page.evaluate(() => (window as any).qa.location.countryIso)).toBe('US');
  await page.evaluate(() => (window as any).qa.reopen());
  await page.getByRole('button', { name: 'Correct the details' }).click();
  await expect(page.getByLabel('Country', { exact: true })).toHaveValue('US');
  await page.getByLabel('Country', { exact: true }).selectOption('CA');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect(await page.evaluate(() => (window as any).qa.draft.draft.countryIso)).toBe('CA');
});

test('full creation sends the selected country and validates missing countries', async ({ page }) => {
  await manualLocation(page);
  await page.evaluate(() => (window as any).qa.draft.patch({
    name: 'Cross-country event', description: 'Test', flyer: new File(['test'], 'flyer.png'),
    startDateTime: '2027-09-25T20:00', endDateTime: '2027-09-26T00:00',
    tickets: [{ Type: 'General', Price: 0, TotalTickets: 100, MinTicketsPerPurchase: 1, MaxTicketsPerPurchase: 20 }],
  }));
  await page.waitForFunction(() => (window as any).qa.draft.canPublish);
  const result = await page.evaluate(() => (window as any).qa.draft.submit('live'));
  expect(result?.published).toBe(true);
  const payload = await page.evaluate(() => (window as any).requests.find((r: any) => r.url === '/api/protected/events').payload);
  expect(payload).toMatchObject({ countryIso: 'CA', city: 'Toronto', currencyIso: 'cad' });
  await page.evaluate(() => (window as any).qa.draft.patch({ countryIso: '' }));
  await page.waitForFunction(() => !(window as any).qa.draft.canPublish);
  expect(await page.evaluate(() => (window as any).qa.draft.missing)).toContain('location');
  expect(await page.evaluate(() => (window as any).qa.draft.canSaveDraft)).toBe(true);
});

test('incomplete drafts retain the event country and region', async ({ page }) => {
  await manualLocation(page);
  await page.evaluate(() => (window as any).qa.draft.patch({ name: 'Draft', stateProvince: 'Ontario' }));
  await page.waitForFunction(() => (window as any).qa.draft.canSaveDraft);
  await page.evaluate(() => (window as any).qa.draft.submit('draft'));
  const payload = await page.evaluate(() => (window as any).requests[0].payload);
  expect(payload).toMatchObject({ countryIso: 'CA', stateProvince: 'Ontario', city: 'Toronto', currencyIso: 'cad' });
  expect(await page.evaluate(() => (window as any).requests.length)).toBe(1);
});

test('autocomplete retains its country; a failed lookup can be corrected manually', async ({ page }) => {
  await page.getByPlaceholder('Search venue or address').fill('Toronto');
  await page.getByRole('button', { name: 'Toronto venue', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect(await page.evaluate(() => (window as any).qa.location.countryIso)).toBe('CA');
  await page.evaluate(() => { (window as any).qa.reset(); (window as any).failPlace = true; });
  await page.getByPlaceholder('Search venue or address').fill('Toronto');
  await page.getByRole('button', { name: 'Toronto venue', exact: true }).click();
  await expect(page.getByLabel('Country', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
  await page.getByLabel('Country', { exact: true }).selectOption('CA');
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
});

test('external listings preserve countries outside the ticket-selling list', async ({ page }) => {
  await page.evaluate(() => (window as any).qa.reset({ address: '1 Test Street', city: 'London', countryIso: 'GB' }, true));
  await page.getByRole('button', { name: 'Correct the details' }).click();
  await expect(page.getByLabel('Country', { exact: true })).toHaveValue('GB');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect(await page.evaluate(() => (window as any).qa.location.countryIso)).toBe('GB');
});
