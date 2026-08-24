// tests/helpers/organizers.ts
import { expect, Page } from '@playwright/test';
import {
  PLAYWRIGHT_BOT_EMAIL,
  ORGANIZER_NAME_PREFIX,
  CONTACT_ADDRESS,
  CONTACT_CITY,
  CONTACT_ZIP_CODE,
  PLAYWRIGHT_BOT_STRIPE_CONNECT_ID,
  NEW_ORGANIZER_NAME,
  NEW_CONTACT_NAME,
  NEW_CONTACT_ADDRESS,
  TEST_PERFORMER_NAME,
  TEST_PERFORMER_ROLE,
  TEST_PERFORMER_BIO,
  NEW_PERFORMER_NAME,
  NEW_PERFORMER_ROLE,
  NEW_PERFORMER_BIO,
  PROMO_CODE,
  PROMO_DISCOUNT_PERCENTAGE,
  NEW_PROMO_CODE,
  NEW_PROMO_DISCOUNT_PERCENTAGE,
  NEW_PROMO_FIXED_AMOUNT,
  TEAM_MEMBER_EMAIL,
} from '../constants';
import { signIn } from './auth';
import { deleteEvent } from './eventHelpers';
import {
  openEventPortalDestination,
  openOrganizerSurface,
} from './portalNavigationHelpers';

export async function setStripeTestAccount(
  page: Page,
  stripeAccountId = PLAYWRIGHT_BOT_STRIPE_CONNECT_ID,
  { required = false }: { required?: boolean } = {}
): Promise<boolean> {
  const stripeToolsButton = page.getByRole('button', {
    name: 'Stripe test tools',
    exact: true,
  });
  const stripeToolsVisible = await stripeToolsButton
    .waitFor({ state: 'visible', timeout: required ? 20_000 : 5_000 })
    .then(() => true)
    .catch(() => false);

  if (!stripeToolsVisible) {
    if (required) {
      throw new Error('Stripe test tools are unavailable in this environment.');
    }
    return false;
  }

  if ((await stripeToolsButton.getAttribute('aria-expanded')) !== 'true') {
    await stripeToolsButton.click();
  }
  const stripeConnectInput = page.getByPlaceholder('acct_xxx...');
  await expect(stripeConnectInput).toBeVisible();
  await stripeConnectInput.fill(stripeAccountId);
  const stripeConnectResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/protected/organizers/') &&
      response.url().includes('/stripe-connect'),
    { timeout: 30_000 }
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const stripeConnectResponse = await stripeConnectResponsePromise;
  if (!stripeConnectResponse.ok()) {
    const body = await stripeConnectResponse.text().catch(() => '<unreadable>');
    throw new Error(
      `Assign Stripe test account failed with ${stripeConnectResponse.status()}: ${body}`
    );
  }
  return true;
}

export async function createOrganizer(
  page: Page,
  {
    email = PLAYWRIGHT_BOT_EMAIL,
    organizerName = ORGANIZER_NAME_PREFIX +
      Math.random().toString(36).substring(2, 15),
  } = {}
): Promise<string> {
  await signIn(page, { targetPath: '/portal/home' });

  const newOrganization = page
    .getByRole('button')
    .filter({ hasText: /^(New organization|Create your first organization)$/ })
    .filter({ visible: true })
    .first();
  await expect(newOrganization).toBeVisible({ timeout: 30_000 });
  await newOrganization.click();

  const sheetHeading = page.getByRole('heading', {
    name: 'New organization',
    exact: true,
  });
  await expect(sheetHeading).toBeVisible({ timeout: 30_000 });
  await page
    .getByPlaceholder('Organization name')
    .filter({ visible: true })
    .first()
    .fill(organizerName);

  const citySearch = page
    .getByPlaceholder('Search for your city')
    .filter({ visible: true })
    .first();
  const autocompleteResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/places-autocomplete',
    { timeout: 30_000 }
  );
  await citySearch.fill(CONTACT_CITY);
  const autocompleteResponse = await autocompleteResponsePromise;
  expect(
    autocompleteResponse.ok(),
    `City autocomplete failed with ${autocompleteResponse.status()}`
  ).toBeTruthy();

  const citySearchRoot = citySearch.locator('xpath=../..');
  const torontoSuggestion = citySearchRoot
    .getByRole('button')
    .filter({ hasText: /Toronto/i })
    .first();
  await expect(torontoSuggestion).toBeVisible({ timeout: 15_000 });
  const placeDetailsResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/places-details',
    { timeout: 30_000 }
  );
  await torontoSuggestion.click();
  const placeDetailsResponse = await placeDetailsResponsePromise;
  expect(
    placeDetailsResponse.ok(),
    `City details failed with ${placeDetailsResponse.status()}`
  ).toBeTruthy();

  await page.locator('#org-contact-email:visible').first().fill(email);
  const createOrganizerResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/protected/organizers',
    { timeout: 30_000 }
  );
  await page
    .getByRole('button', { name: 'Create organization', exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const createOrganizerResponse = await createOrganizerResponsePromise;
  const createOrganizerBody = await createOrganizerResponse
    .text()
    .catch(() => '<unreadable>');
  expect(
    createOrganizerResponse.ok(),
    `Create organization failed with ${createOrganizerResponse.status()}: ${createOrganizerBody}`
  ).toBeTruthy();

  const created = JSON.parse(createOrganizerBody) as { OrganizerId?: string };
  const organizerId = created.OrganizerId;
  if (!organizerId) {
    throw new Error(
      `Could not parse organizer ID from create response: ${createOrganizerBody}`
    );
  }
  await expect(page).toHaveURL(
    new RegExp(`/portal/organizer/company/${organizerId}(?:\\?|$)`),
    { timeout: 30_000 }
  );

  // Change the Stripe Connect ID to point to the onboarded Playwright bot's Stripe Connect ID.
  // The manual Stripe-Connect-ID form is a debug-only affordance rendered only when
  // NEXT_PUBLIC_JASS_ENV !== 'production'. On production-gated deployments it is absent,
  // so treat this step as best-effort: fill it when present, skip it otherwise (comp/free
  // flows don't require a connected account). We wait for the post-create render explicitly
  // instead of a fixed sleep.
  if (!(await setStripeTestAccount(page))) {
    console.log(
      '[INFO] Stripe Connect debug form not present (production-gated env); skipping Connect ID override.'
    );
  }

  console.log(`New organizer URL: ${page.url()}`);
  return organizerId;
}

export async function selectFirstOrganizer(page: Page) {
  await signIn(page, { targetPath: '/portal/home' });

  const organizerLink = page
    .getByRole('button')
    .filter({ hasText: new RegExp(ORGANIZER_NAME_PREFIX) })
    .filter({ visible: true })
    .first();
  await expect(organizerLink).toBeVisible({ timeout: 30000 });
  await organizerLink.click();
  await expect(page).toHaveURL(
    /\/portal\/organizer\/company\/[^/?#]+\/?(?:\?.*)?$/,
    { timeout: 30_000 }
  );

  // The route changes before the organizer portal finishes replacing the home
  // navigation. Wait for a stable organizer-only control before helpers start
  // opening grouped destinations such as Organization > Profile.
  await expect(
    page
      .locator('aside:visible')
      .first()
      .getByRole('button', { name: 'Dashboard', exact: true })
      .first()
  ).toBeVisible({ timeout: 30_000 });
}

export async function editOrganizerDetails(
  page: Page,
  {
    addressEntry = 'autocomplete',
  }: {
    addressEntry?: 'autocomplete' | 'manual';
  } = {}
) {
  const timestamp = Date.now().toString();
  await openOrganizerSurface(page, 'profile');

  await page.getByRole('textbox', { name: 'Organizer Profile Name*' }).click();
  await page
    .getByRole('textbox', { name: 'Organizer Profile Name*' })
    .fill(NEW_ORGANIZER_NAME);
  await page.getByRole('textbox', { name: 'Contact Name*' }).click();
  await page
    .getByRole('textbox', { name: 'Contact Name*' })
    .fill(NEW_CONTACT_NAME + timestamp);
  const addressInput = page.locator('input[name="address"]');
  await addressInput.click();

  if (addressEntry === 'autocomplete') {
    await addressInput.fill(NEW_CONTACT_ADDRESS);

    const addressSuggestion = addressInput
      .locator('xpath=..')
      .locator('li')
      .first();
    await expect(addressSuggestion).toBeVisible({ timeout: 15_000 });

    const addressDetailsResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/places-details'
    );
    await addressSuggestion.click();

    const addressDetailsResponse = await addressDetailsResponsePromise;
    expect(
      addressDetailsResponse.ok(),
      `Address details failed with ${addressDetailsResponse.status()}`
    ).toBeTruthy();
    await expect(page.locator('#city')).not.toHaveValue('', {
      timeout: 10_000,
    });
    await expect(page.locator('#ZipCode')).not.toHaveValue('', {
      timeout: 10_000,
    });
  } else {
    await page.getByRole('button', { name: 'Enter manually' }).click();
    await expect(
      page.getByRole('button', { name: '← Use autocomplete' })
    ).toBeVisible();
    await addressInput.fill(CONTACT_ADDRESS);

    const cityInput = page.locator('#city');
    await cityInput.fill(CONTACT_CITY);
    const citySuggestion = page
      .locator('li')
      .filter({ hasText: new RegExp(`^${CONTACT_CITY}$`) });
    await expect(citySuggestion).toBeVisible();
    await citySuggestion.click();

    await page.locator('#ZipCode').fill(CONTACT_ZIP_CODE);
  }
  await page.getByRole('button', { name: 'Save Changes' }).click();

  // Wait for and return success message
  return page.getByText('Organizer updated successfully');
}

export async function addPerformer(page: Page) {
  await openOrganizerSurface(page, 'team', 'performers');
  await page.getByRole('button', { name: 'Add Performer' }).click();

  const randomPerformerName = `${TEST_PERFORMER_NAME} ${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  await page
    .getByRole('textbox', { name: 'Enter performer name' })
    .fill(randomPerformerName);
  await page
    .getByRole('textbox', { name: 'e.g., DJ, Singer, Band' })
    .fill(TEST_PERFORMER_ROLE);
  await page
    .getByRole('textbox', { name: "Enter performer's bio" })
    .fill(TEST_PERFORMER_BIO);

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/performers')
  );
  await page.getByRole('button', { name: 'Add Performer' }).last().click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBeTruthy();

  // Search for the performer
  await page
    .getByRole('textbox', { name: 'Search performers...' })
    .fill(randomPerformerName);
  await expect(
    page.getByText(randomPerformerName, { exact: true })
  ).toBeVisible();

  // return the performer name
  return randomPerformerName;
}

export async function editPerformer(
  page: Page,
  performerName: string
): Promise<string> {
  await page.getByText(performerName, { exact: true }).click();

  const performerCard = page
    .getByRole('button', { name: `Delete performer ${performerName}` })
    .locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " rounded-lg ")][1]'
    );
  const editInputs = performerCard.locator('input:not([type="file"])');
  await expect(editInputs).toHaveCount(2);

  const newRandomPerformerName = `${NEW_PERFORMER_NAME} ${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  await editInputs.nth(0).fill(newRandomPerformerName);
  await editInputs.nth(1).fill(NEW_PERFORMER_ROLE);
  await performerCard.locator('textarea').fill(NEW_PERFORMER_BIO);

  const updateResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      new URL(response.url()).pathname.includes('/performers/')
  );
  await performerCard
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const updateResponse = await updateResponsePromise;
  expect(updateResponse.ok()).toBeTruthy();

  // Clear the search and search for the new performer name
  await page.getByRole('textbox', { name: 'Search performers...' }).clear();
  await page
    .getByRole('textbox', { name: 'Search performers...' })
    .fill(newRandomPerformerName);
  await expect(
    page.getByText(newRandomPerformerName, { exact: true })
  ).toBeVisible();

  // Return the new performer name
  return newRandomPerformerName;
}

export async function deletePerformer(page: Page, performerName: string) {
  const deleteResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname.includes('/performers/')
  );
  await page
    .getByRole('button', { name: `Delete performer ${performerName}` })
    .click();
  const deleteResponse = await deleteResponsePromise;
  expect(deleteResponse.ok()).toBeTruthy();
  await expect(page.getByText(performerName, { exact: true })).toBeHidden();
}

export async function addPromoCode(page: Page): Promise<string> {
  await openOrganizerSurface(page, 'discounts', 'promocodes');
  await page.getByRole('button', { name: 'Add Promo Code' }).click();
  await page.getByRole('textbox', { name: 'Enter promo code' }).click();

  // random promo code
  const randomPromoCode = `${PROMO_CODE}${Date.now()}`;
  await page
    .getByRole('textbox', { name: 'Enter promo code' })
    .fill(randomPromoCode);
  await page.getByPlaceholder('Enter discount percentage').click();
  await page
    .getByPlaceholder('Enter discount percentage')
    .fill(PROMO_DISCOUNT_PERCENTAGE);
  await page
    .locator('form')
    .getByRole('button', { name: 'Add Promo Code' })
    .click();

  return randomPromoCode;
}

export async function editPromoCode(
  page: Page,
  promoCode: string
): Promise<string> {
  await page.getByText(promoCode).first().click();
  await page.getByRole('textbox', { name: 'Code', exact: true }).click();

  // Generate a new random promo code
  const newRandomPromoCode = `${NEW_PROMO_CODE}${Date.now()}`;
  await page
    .getByRole('textbox', { name: 'Code', exact: true })
    .fill(newRandomPromoCode);
  await page.getByRole('spinbutton', { name: 'Discount Percentage' }).click();
  await page
    .getByRole('spinbutton', { name: 'Discount Percentage' })
    .fill(NEW_PROMO_DISCOUNT_PERCENTAGE);
  await page.getByRole('spinbutton', { name: 'Discount Fixed Amount' }).click();
  await page
    .getByRole('spinbutton', { name: 'Discount Fixed Amount' })
    .press('ArrowLeft');
  await page
    .getByRole('spinbutton', { name: 'Discount Fixed Amount' })
    .fill(NEW_PROMO_FIXED_AMOUNT);
  await page
    .locator('div')
    .filter({ hasText: /^CodeDiscount PercentageDiscount Fixed AmountSave$/ })
    .getByRole('button')
    .click();

  return newRandomPromoCode;
}

export async function deletePromoCode(page: Page, promoCode: string) {
  await page
    .getByRole('button', { name: `Delete promo code ${promoCode}` })
    .click();
  await expect(page.getByText(promoCode).first()).toBeHidden();
}

export async function addTeamMember(page: Page) {
  await openOrganizerSurface(page, 'team', 'members');

  const memberEmail = page.getByText(TEAM_MEMBER_EMAIL, { exact: true });
  if (await memberEmail.isVisible({ timeout: 10_000 }).catch(() => false)) {
    return memberEmail;
  }

  const configurePoliciesButton = page.getByRole('button', {
    name: /Configure Policies/i,
  });
  await expect(configurePoliciesButton).toBeVisible({ timeout: 15_000 });
  await page.locator('#email1').fill(TEAM_MEMBER_EMAIL);
  await configurePoliciesButton.click();

  const selectAllPoliciesButton = page.getByRole('button', {
    name: /Select All Policies/i,
  });
  await expect(selectAllPoliciesButton).toBeVisible({ timeout: 15_000 });
  await selectAllPoliciesButton.click();
  await page.getByRole('button', { name: 'Add Team Member' }).click();

  await expect(memberEmail).toBeVisible({ timeout: 30_000 });
  return memberEmail;
}

export async function accessStripeFinance(page: Page) {
  await openOrganizerSurface(page, 'finance');
  const page3Promise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Access Stripe Dashboard' }).click();
  const page3 = await page3Promise;

  return page3;
}

export async function editOrganizer(
  page: Page,
  {
    email = PLAYWRIGHT_BOT_EMAIL,
    organizerName = ORGANIZER_NAME_PREFIX +
      Math.random().toString(36).substring(2, 15),
  } = {}
): Promise<string> {
  // log in and open the create-organizer form
  await signIn(page, { targetPath: '/portal/home' });

  // Edit the organizer details
  return organizerName;
}
export async function deleteOrganizer(
  page: Page,
  {
    email = PLAYWRIGHT_BOT_EMAIL,
    organizerName = ORGANIZER_NAME_PREFIX +
      Math.random().toString(36).substring(2, 15),
  } = {}
) {
  // This will delete the event, ensuring that the organizer can be deleted
  const { page1 } = await deleteEvent(page);
  await openOrganizerSurface(page1, 'profile');
  await page1
    .getByRole('main')
    .getByRole('button', { name: 'Delete', exact: true })
    .click();

  const deleteModal = page1
    .getByText('Delete Organization', { exact: true })
    .filter({ visible: true })
    .first()
    .locator('xpath=ancestor::div[contains(@class, "pointer-events-auto")][1]');
  await expect(deleteModal).toBeVisible();

  const [deleteResponse] = await Promise.all([
    page1.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        /\/api\/protected\/organizers\/[^/]+$/.test(response.url()),
      { timeout: 30_000 }
    ),
    deleteModal.getByRole('button', { name: 'Delete', exact: true }).click(),
  ]);
  expect(deleteResponse.ok()).toBeTruthy();
  await expect(page1).toHaveURL(
    (url) => url.pathname === '/' || url.pathname === '/portal/home',
    { timeout: 30_000 }
  );
}

export async function addOperatorWithAllPolicies(
  page: Page,
  operatorEmail: string
) {
  await openEventPortalDestination(page, 'eventStaff');

  // Add operator email
  await page
    .getByRole('textbox', { name: 'Email address' })
    .fill(operatorEmail);
  await page.getByRole('button', { name: 'Add Event Staff' }).click();

  // Check all available policies
  const policies = [
    'Read Event',
    'Update Event',
    'Delete Event',
    'Read / Scan Ticket',
    'Read Ticket Type',
    'Create Ticket Type',
    'Update Ticket Type',
    'Delete Ticket Type',
    'Read Transaction',
    'Read Refund',
    'Read External Purchase',
    'Update External Purchase',
  ];

  for (const policy of policies) {
    if (typeof policy === 'string') {
      await page.getByRole('checkbox', { name: policy }).check();
    } else {
      await page.getByRole('checkbox', policy).check();
    }
  }

  // Save policies
  const assignOperatorResponsePromise = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return (
      response.request().method() === 'POST' &&
      /\/api\/protected\/events\/[^/]+\/operators\/?$/.test(pathname)
    );
  });
  await page.getByRole('button', { name: 'Save Policies' }).click();
  const assignOperatorResponse = await assignOperatorResponsePromise;
  expect(
    assignOperatorResponse.ok(),
    `Assign operator failed with ${assignOperatorResponse.status()}: ${await assignOperatorResponse.text()}`
  ).toBeTruthy();
}
