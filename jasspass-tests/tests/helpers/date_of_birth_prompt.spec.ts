import { test, expect } from '@playwright/test';
import { dismissDateOfBirthPromptIfPresent, installDateOfBirthPromptHandler } from '../../helpers/auth';

// Local DOM contract: no Testlab accounts or API calls are needed to reproduce
// the two unrelated controls that both say "Remind me later".
const banner = `
  <aside aria-label="Sell your event faster">
    <h2>Sell your event faster</h2>
    <button onclick="this.dataset.clicked='true'">Remind me later</button>
  </aside>`;
const birthday = `
  <div id="birthday-overlay" style="position:fixed;inset:0;background:white;z-index:9999">
    <div>
      <div>Add your date of birth</div>
      <div><form><div><label for="dob-prompt-input">Date of birth</label>
        <input id="dob-prompt-input" type="date">
      </div></form></div>
      <div><div><button onclick="document.querySelector('#birthday-overlay').remove()">Remind me later</button></div></div>
    </div>
  </div>`;
const pageAction = '<button onclick="this.textContent=\'Opened Orders\'">Open Orders</button>';

for (const withBanner of [false, true]) {
  test(`birthday handler dismisses its modal${withBanner ? ' alongside the Kickback banner' : ''}`, async ({ page }) => {
    await page.setContent(`${withBanner ? banner : ''}${pageAction}${birthday}`);
    await installDateOfBirthPromptHandler(page);
    // Registering twice must not replace the handler or trigger another dismissal.
    await installDateOfBirthPromptHandler(page);
    await page.getByRole('button', { name: 'Open Orders', exact: true }).click();
    await expect(page.locator('#dob-prompt-input')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Opened Orders', exact: true })).toBeVisible();
    if (withBanner) {
      const snooze = page.getByRole('complementary', { name: 'Sell your event faster' })
        .getByRole('button', { name: 'Remind me later', exact: true });
      await expect(snooze).toBeVisible();
      await expect(snooze).not.toHaveAttribute('data-clicked', 'true');
    }
  });
}

test('explicit birthday dismissal leaves the identically named banner button alone', async ({ page }) => {
  await page.setContent(`${banner}${birthday}`);
  await dismissDateOfBirthPromptIfPresent(page);
  await expect(page.locator('#dob-prompt-input')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Remind me later', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remind me later', exact: true }))
    .not.toHaveAttribute('data-clicked', 'true');
});

test('a banner without a birthday modal does not trigger the handler', async ({ page }) => {
  await page.setContent(`${banner}${pageAction}`);
  await dismissDateOfBirthPromptIfPresent(page, 50);
  await page.getByRole('button', { name: 'Open Orders', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Opened Orders', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remind me later', exact: true }))
    .not.toHaveAttribute('data-clicked', 'true');
});
