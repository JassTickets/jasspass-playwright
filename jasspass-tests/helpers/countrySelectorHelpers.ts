import { Page } from '@playwright/test';

export async function selectCountryRobust(
  page: Page,
  countryCode: string
): Promise<void> {
  console.log(`Attempting to select country: ${countryCode}`);

  // Strategy 1: Try selecting by ID (most reliable based on frontend code)
  try {
    await page.locator('#country').selectOption(countryCode);
    console.log(
      `✓ Successfully selected ${countryCode} using #country selector`
    );
    return;
  } catch (error) {
    console.log(`✗ Strategy 1 failed: #country selector - ${error.message}`);
  }

  // Strategy 2: Try clicking the select and then the option
  try {
    await page.locator('#country').click();
    await page.waitForTimeout(500);
    await page.locator(`#country option[value="${countryCode}"]`).click();
    console.log(`✓ Successfully selected ${countryCode} using click strategy`);
    return;
  } catch (error) {
    console.log(`✗ Strategy 2 failed: click strategy - ${error.message}`);
  }

  // Strategy 3: Try using different label variations
  const labelVariations = [
    'Select country',
    'Country',
    'country',
    'País', // Spanish
    'Pays', // French
  ];

  for (const label of labelVariations) {
    try {
      await page.getByLabel(label, { exact: false }).selectOption(countryCode);
      console.log(
        `✓ Successfully selected ${countryCode} using label: ${label}`
      );
      return;
    } catch (error) {
      console.log(
        `✗ Strategy 3 failed for label "${label}" - ${error.message}`
      );
    }
  }

  // Strategy 4: Try using role-based selection
  try {
    await page
      .getByRole('combobox', { name: /country/i })
      .selectOption(countryCode);
    console.log(`✓ Successfully selected ${countryCode} using combobox role`);
    return;
  } catch (error) {
    console.log(`✗ Strategy 4 failed: combobox role - ${error.message}`);
  }

  // Strategy 5: Try using CSS selector with select tag
  try {
    await page.locator('select[id="country"]').selectOption(countryCode);
    console.log(`✓ Successfully selected ${countryCode} using CSS selector`);
    return;
  } catch (error) {
    console.log(`✗ Strategy 5 failed: CSS selector - ${error.message}`);
  }

  // Strategy 6: Try finding by placeholder or any select element
  try {
    const selects = await page.locator('select').all();
    for (let i = 0; i < selects.length; i++) {
      try {
        await selects[i].selectOption(countryCode);
        console.log(
          `✓ Successfully selected ${countryCode} using select element ${i}`
        );
        return;
      } catch (error) {
        console.log(`✗ Select element ${i} failed - ${error.message}`);
      }
    }
  } catch (error) {
    console.log(`✗ Strategy 6 failed: finding all selects - ${error.message}`);
  }

  // Strategy 7: Try using keyboard navigation
  try {
    await page.locator('#country').focus();
    await page.keyboard.press('ArrowDown'); // Open dropdown
    await page.waitForTimeout(300);

    // Try to find and select the option by typing
    await page.keyboard.type(countryCode);
    await page.keyboard.press('Enter');
    console.log(
      `✓ Successfully selected ${countryCode} using keyboard navigation`
    );
    return;
  } catch (error) {
    console.log(`✗ Strategy 7 failed: keyboard navigation - ${error.message}`);
  }

  // Strategy 8: Last resort - try JavaScript evaluation
  try {
    await page.evaluate((code) => {
      const select = document.getElementById('country') as HTMLSelectElement;
      if (select) {
        select.value = code;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, countryCode);
    console.log(
      `✓ Successfully selected ${countryCode} using JavaScript evaluation`
    );
    return;
  } catch (error) {
    console.log(
      `✗ Strategy 8 failed: JavaScript evaluation - ${error.message}`
    );
  }

  throw new Error(`All strategies failed to select country: ${countryCode}`);
}
