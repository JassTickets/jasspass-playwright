import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { refundCleanupTransaction } from '../../helpers/refundCleanup';

const { retainFinancialCleanupRun, confirmFinancialCleanup, assertFinancialCleanupComplete } =
  require('../../../scripts/financial-cleanup-guard.cjs') as {
    retainFinancialCleanupRun(runId: string, eventId: string, root: string): void;
    confirmFinancialCleanup(runId: string, eventId: string, root: string): void;
    assertFinancialCleanupComplete(runId: string, root: string): void;
  };
const eventId = '6aa19eeb062f387db061417b';
const data = { eventId, transactionId: 'transaction-1', ticketIds: ['ticket-1'], details: 'Unit cleanup',
  refundType: 'Online', includesServiceFee: true, includesOrganizerFee: true, includesTransactionFee: true, includesTax: true };
const refund = { EventId: eventId, TransactionId: data.transactionId, TicketIds: data.ticketIds,
  Complete: true, RefundReferenceId: 're_test', RefundStatus: 'succeeded' };
const ticket = { Id: 'ticket-1', TransactionId: data.transactionId, Status: 'RefundedBeforeEvent' };
const response = (body: unknown, status = 200) => ({ ok: () => status >= 200 && status < 300,
  status: () => status, json: async () => body, text: async () => JSON.stringify(body) }) as APIResponse;

function apiDouble({ status, refunds = [refund], tickets = [ticket], readFailure = false }: {
  status?: number; refunds?: unknown[]; tickets?: unknown[]; readFailure?: boolean;
} = {}) {
  let posts = 0; let reads = 0;
  const api = {
    post: async () => { posts++; if (status) return response(null, status);
      throw new Error('apiRequestContext.post: read ECONNRESET\n cookie: DO_NOT_LOG'); },
    get: async (url: string) => { reads++; if (readFailure) throw new Error('GET reset');
      return response(url.endsWith('/refunds') ? refunds : tickets); },
  } as unknown as APIRequestContext;
  return { api, posts: () => posts, reads: () => reads };
}

test.describe('Financial cleanup safety @cleanup-contract', () => {
  test('accepts an acknowledged refund without retrying the POST', async () => {
    const fake = apiDouble({ status: 200 });
    await refundCleanupTransaction(fake.api, data, 'CONFIRMATION', { timeoutMs: 0 });
    expect(fake.posts()).toBe(1); expect(fake.reads()).toBe(0);
  });
  test('recovers a lost response only after checking refund and ticket state', async () => {
    const fake = apiDouble();
    await refundCleanupTransaction(fake.api, data, 'CONFIRMATION', { timeoutMs: 0 });
    expect(fake.posts()).toBe(1); expect(fake.reads()).toBe(2);
  });
  test('recovers a gateway error if the original refund completed', async () => {
    const fake = apiDouble({ status: 502 });
    await refundCleanupTransaction(fake.api, data, 'CONFIRMATION', { timeoutMs: 0 });
    expect(fake.posts()).toBe(1);
  });
  test('polls reads while the original refund finishes without resubmitting it', async () => {
    const fake = apiDouble(); let reads = 0;
    fake.api.get = async (url: string) => {
      reads++;
      return response(url.endsWith('/refunds') ? [{ ...refund, Complete: reads > 2 }] : [ticket]);
    };
    await refundCleanupTransaction(fake.api, data, 'CONFIRMATION', { timeoutMs: 1_000, intervalMs: 1 });
    expect(fake.posts()).toBe(1); expect(reads).toBe(4);
  });
  for (const scenario of [
    { name: 'missing refund', refunds: [] },
    { name: 'incomplete refund', refunds: [{ ...refund, Complete: false }] },
    { name: 'pending provider refund', refunds: [{ ...refund, RefundStatus: 'pending' }] },
    { name: 'missing provider reference', refunds: [{ ...refund, RefundReferenceId: null }] },
    { name: 'wrong transaction', refunds: [{ ...refund, TransactionId: 'another' }] },
    { name: 'wrong event', refunds: [{ ...refund, EventId: 'another' }] },
    { name: 'wrong refunded ticket', refunds: [{ ...refund, TicketIds: ['another'] }] },
    { name: 'missing ticket', tickets: [] },
    { name: 'active ticket', tickets: [{ ...ticket, Status: 'Active' }] },
    { name: 'ticket from another transaction', tickets: [{ ...ticket, TransactionId: 'another' }] },
    { name: 'unavailable verification endpoint', readFailure: true },
  ]) {
    test(`fails safely for ${scenario.name} without repeating the refund`, async () => {
      const fake = apiDouble(scenario);
      let message = '';
      try { await refundCleanupTransaction(fake.api, data, 'CONFIRMATION', { timeoutMs: 0 }); }
      catch (error) { message = (error as Error).message; }
      expect(message).toContain('outcome unconfirmed after ECONNRESET');
      expect(message).toContain(data.transactionId);
      expect(message).not.toContain('DO_NOT_LOG');
      expect(fake.posts()).toBe(1);
    });
  }
  test('does not mask an API rejection as successful cleanup', async () => {
    const fake = apiDouble({ status: 403 });
    await expect(refundCleanupTransaction(fake.api, data, 'CONFIRMATION', { timeoutMs: 0 }))
      .rejects.toThrow('HTTP 403');
    expect(fake.posts()).toBe(1); expect(fake.reads()).toBe(0);
  });
  test('blocks deletion until every financial event in this run is confirmed', async ({}, testInfo) => {
    const root = testInfo.outputPath('cleanup-guard');
    const otherEvent = '6aa19eeb062f387db061417c';
    retainFinancialCleanupRun('suite-a', eventId, root);
    retainFinancialCleanupRun('suite-a', otherEvent, root);
    expect(() => assertFinancialCleanupComplete('suite-a', root)).toThrow(eventId);
    expect(() => assertFinancialCleanupComplete('suite-b', root)).not.toThrow();
    confirmFinancialCleanup('suite-a', eventId, root);
    expect(() => assertFinancialCleanupComplete('suite-a', root)).toThrow(otherEvent);
    confirmFinancialCleanup('suite-a', otherEvent, root);
    expect(() => assertFinancialCleanupComplete('suite-a', root)).not.toThrow();
  });
  for (const mode of ['global teardown', 'CI fallback']) {
    test(`${mode} refuses cleanup when a financial blocker exists`, async ({}, testInfo) => {
      const root = testInfo.outputPath('guard-process');
      retainFinancialCleanupRun('blocked-run', eventId, root);
      const script = require.resolve('../../../scripts/cleanup-integration-test-run.cjs');
      const args = mode === 'CI fallback' ? [script] : ['-e', `
        require(${JSON.stringify(script)}).cleanupIntegrationTestRun({
          baseURL: 'https://example.invalid', runId: 'blocked-run', required: true
        }).catch(error => { console.error(error.message); process.exitCode = 1; });
      `];
      const result = spawnSync(process.execPath, args, {
        cwd: root, encoding: 'utf8', timeout: 10_000,
        env: { ...process.env, JASS_TEST_URL: 'https://example.invalid', INTEGRATION_TEST_RUN_ID: 'blocked-run' },
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Resource deletion blocked');
      expect(result.stderr).toContain(eventId);
      expect(result.stderr).not.toContain('login failed');
    });
  }
});
