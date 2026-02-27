// tests/helpers/organizers.ts
import { Page } from '@playwright/test';
import {
  JASS_TEST_CHANGE_ORG_URL,
  PLAYWRIGHT_BOT_EMAIL,
  ORGANIZER_NAME_PREFIX,
  getRandomCountry,
  CONTACT_NAME,
  CONTACT_ADDRESS,
  CONTACT_PHONE_NUMBER,
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
import { selectCountryRobust } from './countrySelectorHelpers';

export async function createOrganizer(
  page: Page,
  {
    email = PLAYWRIGHT_BOT_EMAIL,
    organizerName = ORGANIZER_NAME_PREFIX +
      Math.random().toString(36).substring(2, 15),
  } = {}
): Promise<string> {
  // log in and open the create-organizer form
  await signIn(page);

  // wait for 0.5 seconds
  await page.waitForTimeout(500);

  await page.goto(JASS_TEST_CHANGE_ORG_URL);
  // wait for 0.5 seconds
  await page.waitForTimeout(500);
  await page
    .getByRole('button', { name: 'Create Organizer Profile' })
    .first()
    .click();

  // fill out fields
  await page
    .getByRole('textbox', { name: 'Organizer Profile Name *' })
    .fill(organizerName);

  // Robust country selection with fallback
  const randomCountry = getRandomCountry();
  await selectCountryRobust(page, randomCountry);

  await page
    .getByRole('textbox', { name: 'Contact Name *' })
    .fill(CONTACT_NAME);
  await page
    .getByRole('textbox', { name: 'Organizer Profile Email *' })
    .fill(email);
  await page.locator('#phone-input').fill(CONTACT_PHONE_NUMBER);
  await page
    .getByRole('textbox', { name: 'Organizer Address *' })
    .fill(CONTACT_ADDRESS);
  await page
    .getByRole('checkbox', { name: 'I agree to the Organizer' })
    .check();
  // submit and wait for navigation to the new organizer’s page
  await page.getByRole('button', { name: 'Create Organizer' }).click();

  //wait for 2 seconds
  await page.waitForTimeout(2000);

  // change the Stripe Connect ID to point to the onboarded Playwright bot's Stripe Connect ID
  await page.getByRole('textbox', { name: 'acct_xxx...' }).click();
  await page
    .getByRole('textbox', { name: 'acct_xxx...' })
    .fill(PLAYWRIGHT_BOT_STRIPE_CONNECT_ID);
  await page.getByRole('button', { name: 'Save' }).click();

  // parse out the ID from the URL
  const url = page.url();

  console.log(`New organizer URL: ${url}`);
  const match = url.match(/company\/([^/]+)/);
  if (!match) {
    throw new Error(`Could not parse organizer ID from URL: ${url}`);
  }
  return match[1];
}

export async function selectFirstOrganizer(page: Page) {
  await signIn(page);
  await page.waitForTimeout(500);

  // Click the first organizer that contains PBO prefix
  await page.getByText(new RegExp(ORGANIZER_NAME_PREFIX)).first().click();
}

export async function editOrganizerDetails(page: Page) {
  const timestamp = Date.now().toString();
  await page.getByRole('link', { name: 'Manage' }).click();
  await page.getByRole('textbox', { name: 'Organizer Profile Name *' }).click();
  await page
    .getByRole('textbox', { name: 'Organizer Profile Name *' })
    .fill(NEW_ORGANIZER_NAME);
  await page.getByRole('textbox', { name: 'Contact Name *' }).click();
  await page
    .getByRole('textbox', { name: 'Contact Name *' })
    .fill(NEW_CONTACT_NAME + timestamp);
  await page.getByRole('textbox', { name: 'Organizer Address *' }).click();
  await page
    .getByRole('textbox', { name: 'Organizer Address *' })
    .fill(NEW_CONTACT_ADDRESS);
  await page.getByRole('button', { name: 'Save Changes' }).click();

  // Wait for and return success message
  return page.getByText('Organizer updated successfully');
}

export async function addPerformer(page: Page) {
  await page.getByRole('button', { name: 'Performers' }).click();
  await page.getByRole('button', { name: 'Add Performer' }).click();
  await page.getByRole('textbox', { name: 'Enter performer name' }).click();

  //generate a random performer name
  const randomPerformerName = `${TEST_PERFORMER_NAME} ${Date.now()}`;
  await page
    .getByRole('textbox', { name: 'Enter performer name' })
    .fill(randomPerformerName);
  await page.getByRole('textbox', { name: 'e.g., DJ, Singer, Band' }).click();
  await page
    .getByRole('textbox', { name: 'e.g., DJ, Singer, Band' })
    .fill(TEST_PERFORMER_ROLE);
  await page.getByRole('textbox', { name: "Enter performer's bio" }).click();
  await page
    .getByRole('textbox', { name: "Enter performer's bio" })
    .fill(TEST_PERFORMER_BIO);
  await page.getByRole('button', { name: 'Add Performer' }).nth(1).click();

  // Check that it was added

  // Timeout
  await page.waitForTimeout(1000);

  // Search for the performer
  await page.getByRole('textbox', { name: 'Search performers...' }).click();
  await page
    .getByRole('textbox', { name: 'Search performers...' })
    .fill(randomPerformerName);
  await page
    .getByRole('heading', { name: randomPerformerName })
    .first()
    .click();

  // return the performer name
  return randomPerformerName;
}

export async function editPerformer(
  page: Page,
  performerName: string
): Promise<string> {
  await page.getByRole('heading', { name: performerName }).click();
  await page.locator('.flex > div:nth-child(2) > svg').first().click();
  // Generate a new random performer name
  const newRandomPerformerName = `${NEW_PERFORMER_NAME} ${Date.now()}`;
  await page
    .locator('div')
    .filter({ hasText: /^Name$/ })
    .getByRole('textbox')
    .fill(newRandomPerformerName);
  await page
    .locator('div')
    .filter({ hasText: /^Role$/ })
    .getByRole('textbox')
    .click();
  await page
    .locator('div')
    .filter({ hasText: /^Role$/ })
    .getByRole('textbox')
    .fill(NEW_PERFORMER_ROLE);
  await page.getByText(TEST_PERFORMER_BIO).click();
  await page.getByText(TEST_PERFORMER_BIO).fill(NEW_PERFORMER_BIO);
  await page
    .locator('div')
    .filter({
      hasText: /^Change PhotoNameRoleBioTest performer bio New BioSave$/,
    })
    .getByRole('button')
    .click();

  // Clear the search and search for the new performer name
  await page.getByRole('textbox', { name: 'Search performers...' }).clear();
  await page
    .getByRole('textbox', { name: 'Search performers...' })
    .fill(newRandomPerformerName);

  // Return the new performer name
  return newRandomPerformerName;
}

export async function deletePerformer(page: Page) {
  await page.locator('svg:nth-child(2)').first().click();
}

export async function addPromoCode(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Promo Codes' }).click();
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

export async function deletePromoCode(page: Page) {
  await page.locator('svg:nth-child(2)').first().click();
}

export async function addTeamMember(page: Page) {
  await page.getByRole('button', { name: 'Team' }).click();

  const configurePoliciesButton = page.getByRole('button', {
    name: /Configure Policies/i,
  });

  // Wait for 0.5 seconds
  await page.waitForTimeout(500);

  if ((await configurePoliciesButton.count()) > 0) {
    await page.locator('#email1').click();
    await page.locator('#email1').fill(TEAM_MEMBER_EMAIL);
    await configurePoliciesButton.first().click();

    const selectAllPoliciesButton = page.getByRole('button', {
      name: /Select All Policies/i,
    });
    if ((await selectAllPoliciesButton.count()) > 0) {
      await selectAllPoliciesButton.first().click();
    }

    await page.getByRole('button', { name: 'Add Representative' }).last().click();
  } else {
    // Backward-compatible flow with modal + role selection.
    await page.getByRole('button', { name: 'Add Representative' }).click();
    await page.locator('#email1').click();
    await page.locator('#email1').fill(TEAM_MEMBER_EMAIL);
    await page.getByRole('button', { name: 'Add Representative' }).click();
    await page.getByRole('radio', { name: 'Organizer Owner' }).check();
    await page.getByRole('button', { name: 'Add Representative' }).click();
  }

  return page.getByRole('row', { name: new RegExp(TEAM_MEMBER_EMAIL, 'i') });
}

export async function editTeamMemberRole(page: Page) {
  const representativeRow = page.getByRole('row', {
    name: new RegExp(TEAM_MEMBER_EMAIL, 'i'),
  });
  await representativeRow.getByRole('button').first().click();

  const organizerAdminRadio = page.getByRole('radio', {
    name: 'Organizer Admin',
  });

  if ((await organizerAdminRadio.count()) > 0) {
    // Backward-compatible modal flow.
    await organizerAdminRadio.check();
    await page.getByRole('button', { name: 'Save' }).click();
  } else {
    await page.getByRole('button', { name: 'Add Representative' }).last().click();
  }
}

export async function deleteTeamMember(page: Page) {
  await page
    .getByRole('row', { name: new RegExp(TEAM_MEMBER_EMAIL, 'i') })
    .getByRole('button')
    .nth(1)
    .click();
  await page.getByRole('button', { name: 'Delete' }).click();
}

export async function accessStripeFinance(page: Page) {
  await page.getByRole('button', { name: 'Finance' }).click();
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
  await signIn(page);

  // wait for 0.5 seconds
  await page.waitForTimeout(500);

  await page.goto(JASS_TEST_CHANGE_ORG_URL);
  // Click the first organizer in the list

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
  // Wait for 3 seconds
  await page1.waitForTimeout(3000);

  await page1.getByRole('link', { name: 'Manage' }).click();
  await page1.getByRole('button', { name: 'Delete' }).click();
  await page1.getByRole('button', { name: 'Delete' }).click();
}
