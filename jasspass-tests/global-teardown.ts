import type { FullConfig } from '@playwright/test';
import {
  JASS_TEST_URL,
  PLAYWRIGHT_BOT_EMAIL,
  PLAYWRIGHT_BOT_PASSWORD,
  INTEGRATION_TEST_RUN_ID,
} from './constants';

const { cleanupIntegrationTestRun } = require('../scripts/cleanup-integration-test-run.cjs') as {
  cleanupIntegrationTestRun(options: {
    baseURL: string;
    runId: string;
    email: string;
    password: string;
    required: boolean;
  }): Promise<void>;
};

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  await cleanupIntegrationTestRun({
    baseURL: JASS_TEST_URL,
    runId: INTEGRATION_TEST_RUN_ID,
    email: PLAYWRIGHT_BOT_EMAIL,
    password: PLAYWRIGHT_BOT_PASSWORD,
    required: process.env.INTEGRATION_TEST_RESOURCE_CLEANUP_REQUIRED === 'true',
  });
}
