import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './unit-tests',
  workers: 1,
});
