const { request } = require('@playwright/test');

async function responseText(response) {
  return response.text().catch(() => '<response body unavailable>');
}

async function cleanupIntegrationTestRun({
  baseURL,
  runId,
  email,
  password,
  required = false,
}) {
  if (!baseURL) {
    throw new Error('JASS_TEST_URL is required for Integration test cleanup.');
  }
  if (!runId) {
    if (required) throw new Error('INTEGRATION_TEST_RUN_ID is required for integration test cleanup.');
    return;
  }

  const api = await request.newContext({ baseURL });
  try {
    const login = await api.post('/api/public/auth/login', {
      data: { Email: email, Password: password },
    });
    if (!login.ok()) {
      throw new Error(
        `Integration test cleanup login failed with ${login.status()}: ${await responseText(login)}`,
      );
    }

    const cleanup = await api.delete(
      '/api/protected/integration-test-resources',
      { headers: { 'X-Integration-Test-Run-Id': runId } },
    );
    if (cleanup.status() === 404 && !required) {
      console.log(
        `[cleanup] Integration-test resource tracking is disabled; skipped integration test run ${runId}.`,
      );
      return;
    }
    if (!cleanup.ok()) {
      throw new Error(
        `Integration test cleanup failed with ${cleanup.status()}: ${await responseText(cleanup)}`,
      );
    }

    const result = await cleanup.json();
    console.log(
      `[cleanup] Completed run: removed ${result.DeletedDocumentCount} MongoDB documents for ${result.EventCount} events and ${result.OrganizerCount} organizers.`,
    );
  } finally {
    await api.dispose();
  }
}

module.exports = { cleanupIntegrationTestRun };

if (require.main === module) {
  cleanupIntegrationTestRun({
    baseURL: process.env.JASS_TEST_URL,
    runId: process.env.INTEGRATION_TEST_RUN_ID,
    email: process.env.PLAYWRIGHT_BOT_EMAIL ?? 'playwright-bot@gmail.com',
    password:
      process.env.PLAYWRIGHT_BOT_PASSWORD ?? 'PlaywrightBot@1234',
    required: process.env.INTEGRATION_TEST_RESOURCE_CLEANUP_REQUIRED === 'true',
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
