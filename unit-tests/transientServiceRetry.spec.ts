import { expect, test } from '@playwright/test';
import type { APIResponse } from '@playwright/test';
import {
  isTransientServiceStatus,
  retryTransientResponse,
} from '../jasspass-tests/helpers/transientServiceRetry';

function response(status: number, disposed: number[]): APIResponse {
  return {
    status: () => status,
    dispose: async () => {
      disposed.push(status);
    },
  } as APIResponse;
}

test.describe('transient service retry', () => {
  test('classifies only gateway availability failures as transient', () => {
    expect([502, 503, 504].every(isTransientServiceStatus)).toBe(true);
    expect([400, 401, 404, 409, 429, 500].some(isTransientServiceStatus)).toBe(
      false
    );
  });

  test('retries transient responses and returns the recovered response', async () => {
    const disposed: number[] = [];
    const responses = [
      response(503, disposed),
      response(502, disposed),
      response(200, disposed),
    ];
    let calls = 0;

    const result = await retryTransientResponse(
      async () => responses[calls++],
      { delays: [0, 0] }
    );

    expect(result.status()).toBe(200);
    expect(calls).toBe(3);
    expect(disposed).toEqual([503, 502]);
  });

  test('does not retry application failures', async () => {
    const disposed: number[] = [];
    let calls = 0;

    const result = await retryTransientResponse(
      async () => {
        calls += 1;
        return response(500, disposed);
      },
      { delays: [0, 0] }
    );

    expect(result.status()).toBe(500);
    expect(calls).toBe(1);
    expect(disposed).toEqual([]);
  });

  test('supports browser responses without disposal and stops after the retry budget', async () => {
    let calls = 0;

    const result = await retryTransientResponse(
      async () => {
        calls += 1;
        return { status: () => 503 };
      },
      { delays: [0, 0] }
    );

    expect(result.status()).toBe(503);
    expect(calls).toBe(3);
  });
});
