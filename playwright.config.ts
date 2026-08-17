import { defineConfig, devices } from '@playwright/test';

const countryCurrencyMatrixTest =
  '**/critical_paths/country_currency_matrix.spec.ts';
const seatingIntegrationTests = [
  '**/critical_paths/seated_event_checkout.spec.ts',
  '**/critical_paths/seated_event_holds.spec.ts',
  '**/critical_paths/seated_group_booking.spec.ts',
  '**/critical_paths/seated_map_editing.spec.ts',
  '**/critical_paths/seated_concurrency.spec.ts',
  '**/critical_paths/seated_ticket_status.spec.ts',
  '**/critical_paths/seated_paid_refund.spec.ts',
  '**/critical_paths/seated_access_control.spec.ts',
  '**/critical_paths/seated_duplication.spec.ts',
  '**/critical_paths/seated_transfer_reassignment.spec.ts',
  '**/critical_paths/seated_realtime.spec.ts',
  '**/event_portal/seated_event_management.spec.ts',
];
const isolatedIntegrationTests = [
  countryCurrencyMatrixTest,
  ...seatingIntegrationTests,
];

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './jasspass-tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      testIgnore: isolatedIntegrationTests,
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      testIgnore: isolatedIntegrationTests,
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      testIgnore: isolatedIntegrationTests,
      use: { ...devices['Desktop Safari'] },
    },

    {
      name: 'country-currency-matrix',
      testMatch: countryCurrencyMatrixTest,
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'seating-integration',
      testMatch: seatingIntegrationTests,
      use: { ...devices['Desktop Chrome'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
