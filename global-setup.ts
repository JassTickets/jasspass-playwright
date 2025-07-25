import type { FullConfig } from '@playwright/test';
import { chromium } from '@playwright/test';
import { signIn } from './jasspass-tests/helpers/auth';

async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await signIn(page);

  // 3 second timeout
  await page.waitForTimeout(3000);
  await page.context().storageState({ path: 'storageState.json' });
  await browser.close();
}

export default globalSetup;
