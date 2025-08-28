import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  // Recording...

  await page.locator('path').nth(2).click();
  await page.locator('form').getByRole('img').click();

  await page.getByRole('textbox', { name: 'Password' }).click();
  await page
    .getByRole('textbox', { name: 'Password' })
    .fill('PlaywrightBot@1234');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Click the first found organizer in the list. Instead of having the full name, it should only contain PBO, that's it. And should get the first one.
  await page
    .getByText(
      'PPBO - cz4f39br8z5CAPlaywright Bot St, 1234playwright-bot@gmail.com+1 (646) 789-'
    )
    .click();

  // Edit organizer details
  await page.getByRole('link', { name: 'Manage' }).click();
  await page.getByRole('textbox', { name: 'Organizer Profile Name *' }).click();
  await page
    .getByRole('textbox', { name: 'Organizer Profile Name *' })
    .fill('PBO - New Name');
  await page.getByRole('textbox', { name: 'Contact Name *' }).click();
  await page
    .getByRole('textbox', { name: 'Contact Name *' })
    .fill('Playwright Bot New Name');
  await page.getByRole('textbox', { name: 'Organizer Address *' }).click();
  await page
    .getByRole('textbox', { name: 'Organizer Address *' })
    .fill('Playwright Bot St, 1234 New Address');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  // Check for the success message
  await page.getByText('Organizer updated successfully').click();

  // ************************************************************
  // Now testing performers
  await page.getByRole('button', { name: 'Performers' }).click();
  await page.getByRole('button', { name: 'Add Performer' }).click();
  await page.getByRole('textbox', { name: 'Enter performer name' }).click();
  await page
    .getByRole('textbox', { name: 'Enter performer name' })
    .fill('Test Performer');
  await page.getByRole('textbox', { name: 'e.g., DJ, Singer, Band' }).click();
  await page
    .getByRole('textbox', { name: 'e.g., DJ, Singer, Band' })
    .fill('DJ');
  await page.getByRole('textbox', { name: "Enter performer's bio" }).click();
  await page
    .getByRole('textbox', { name: "Enter performer's bio" })
    .fill('Test performer bio');
  await page.getByRole('button', { name: 'Add Performer' }).nth(1).click();
  await page.getByRole('heading', { name: 'Test Performer' }).click();
  await page
    .locator('div')
    .filter({ hasText: /^Name$/ })
    .getByRole('textbox')
    .click();
  await page
    .locator('div')
    .filter({ hasText: /^Name$/ })
    .getByRole('textbox')
    .fill('Test Performer New Name');
  await page
    .locator('div')
    .filter({ hasText: /^Role$/ })
    .getByRole('textbox')
    .click();
  await page
    .locator('div')
    .filter({ hasText: /^Role$/ })
    .getByRole('textbox')
    .fill('DJ New Role');
  await page.getByText('Test performer bio').click();
  await page.getByText('Test performer bio').fill('Test performer bio New Bio');
  await page
    .locator('div')
    .filter({
      hasText: /^Change PhotoNameRoleBioTest performer bio New BioSave$/,
    })
    .getByRole('button')
    .click();
  await page.getByRole('heading', { name: 'Test Performer New Name' }).click();
  await page.locator('svg:nth-child(2)').first().click();

  //************************************************************
  // Now testing Promo Codes

  await page.getByRole('button', { name: 'Promo Codes' }).click();
  await page.getByRole('button', { name: 'Add Promo Code' }).click();
  await page.getByRole('textbox', { name: 'Enter promo code' }).click();
  await page.getByRole('textbox', { name: 'Enter promo code' }).fill('10OFF');
  await page.getByPlaceholder('Enter discount percentage').click();
  await page.getByPlaceholder('Enter discount percentage').fill('010');
  await page
    .locator('form')
    .getByRole('button', { name: 'Add Promo Code' })
    .click();
  await page.getByText('10OFF').click();
  await page.getByRole('textbox', { name: 'Code', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Code', exact: true })
    .fill('10OFFNEW');
  await page.getByRole('spinbutton', { name: 'Discount Percentage' }).click();
  await page
    .getByRole('spinbutton', { name: 'Discount Percentage' })
    .fill('100');
  await page.getByRole('spinbutton', { name: 'Discount Fixed Amount' }).click();
  await page
    .getByRole('spinbutton', { name: 'Discount Fixed Amount' })
    .press('ArrowLeft');
  await page
    .getByRole('spinbutton', { name: 'Discount Fixed Amount' })
    .fill('100');
  await page
    .locator('div')
    .filter({ hasText: /^CodeDiscount PercentageDiscount Fixed AmountSave$/ })
    .getByRole('button')
    .click();
  await page.getByText('10OFFNEW').click();
  await page.locator('svg:nth-child(2)').first().click();
  //**********************************************************************
  // Now testing Finance

  await page.getByRole('button', { name: 'Team' }).click();
  await page.getByRole('button', { name: 'Add Representative' }).click();
  await page.locator('#email1').click();
  await page.locator('#email1').fill('dnsantosuosso@gmail.com');
  await page.getByRole('button', { name: 'Add Representative' }).click();
  await page.getByRole('radio', { name: 'Organizer Owner' }).check();
  await page.getByRole('button', { name: 'Add Representative' }).click();
  await page
    .getByRole('row', { name: 'Diego Santosuosso' })
    .getByRole('button')
    .first()
    .click();
  await page.getByRole('radio', { name: 'Organizer Admin' }).check();
  await page.getByRole('button', { name: 'Save' }).click();
  await page
    .getByRole('row', { name: 'Diego Santosuosso' })
    .getByRole('button')
    .nth(1)
    .click();
  await page.getByRole('button', { name: 'Delete' }).click();

  //**************************************************
  // Now testing finance tab
  await page.getByRole('button', { name: 'Promo Codes' }).click();
  await page.getByRole('button', { name: 'Finance' }).click();
  const page3Promise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Access Stripe Dashboard' }).click();

  // Now verify that it redirected the user to another tab
  const page3 = await page3Promise;
  await page3.locator('div:nth-child(19) > div:nth-child(2)').click();
});
