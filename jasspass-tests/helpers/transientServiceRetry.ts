export const TRANSIENT_SERVICE_STATUSES = new Set([502, 503, 504]);
export const TRANSIENT_SERVICE_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

type RetryableResponse = {
  status(): number;
  dispose?(): Promise<void>;
};

export function isTransientServiceStatus(status: number): boolean {
  return TRANSIENT_SERVICE_STATUSES.has(status);
}

export async function retryTransientResponse<T extends RetryableResponse>(
  operation: () => Promise<T>,
  {
    delays = TRANSIENT_SERVICE_RETRY_DELAYS_MS,
    onRetry,
  }: {
    delays?: readonly number[];
    onRetry?: (response: T, attempt: number, delayMs: number) => void;
  } = {}
): Promise<T> {
  let response = await operation();

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (!isTransientServiceStatus(response.status())) return response;

    const delayMs = delays[attempt];
    onRetry?.(response, attempt + 1, delayMs);
    await response.dispose?.();
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    response = await operation();
  }

  return response;
}
