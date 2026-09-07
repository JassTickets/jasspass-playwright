import { expect, test } from '@playwright/test';
import { JASS_TEST_URL } from '../../constants';

test.describe('email signup form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${JASS_TEST_URL}/signup`, {
      waitUntil: 'domcontentloaded',
    });
    await page
      .getByRole('button', { name: 'Sign up with email instead' })
      .click();
  });

  test('shows the current identity and consent fields', async ({ page }) => {
    await expect(page.getByLabel('First Name')).toBeVisible();
    await expect(page.getByLabel('Last Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();

    const dateOfBirth = page.locator('#su-dob');
    await expect(dateOfBirth).toBeVisible();
    await expect(dateOfBirth).not.toHaveAttribute('required', '');

    await expect(page.getByLabel('Country')).toBeVisible();
    await expect(page.locator('input[type="tel"]:visible')).toHaveCount(1);
    await expect(page.getByLabel('Password')).toBeVisible();

    const organizer = page.getByRole('checkbox', {
      name: /Sign up as an Organizer/,
    });
    const terms = page.getByRole('checkbox', {
      name: /I accept the terms & conditions and privacy policy/,
    });
    const sms = page.getByRole('checkbox', {
      name: 'Text me JassPass offers.',
    });

    await expect(organizer).not.toBeChecked();
    await expect(terms).toHaveAttribute('required', '');
    await expect(terms).not.toBeChecked();
    await expect(sms).not.toBeChecked();

    await terms.check();
    await sms.check();
    await expect(terms).toBeChecked();
    await expect(sms).toBeChecked();
  });
});
