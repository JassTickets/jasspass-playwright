import { type APIRequestContext } from '@playwright/test';
import { getApiArray } from './criticalCheckoutHelpers';
import type { OrderTicket } from './kickbackHelpers';

type CleanupRefund = {
  EventId: string; TransactionId: string; TicketIds: string[];
  Complete: boolean; RefundReferenceId?: string; RefundStatus?: string;
};

export async function refundCleanupTransaction(
  api: APIRequestContext,
  data: {
    eventId: string; transactionId: string; ticketIds: string[]; details: string;
    refundType: string; includesServiceFee: boolean; includesOrganizerFee: boolean;
    includesTransactionFee: boolean; includesTax: boolean;
  },
  confirmation: string,
  { timeoutMs = 60_000, intervalMs = 2_000 } = {},
): Promise<void> {
  if (!data.ticketIds.length) throw new Error('Cleanup refund requires ticket IDs');
  let outcome: string;
  try {
    // A reset does not prove the server rejected the request. Never replay this POST.
    const response = await api.post('/api/protected/refunds', { data, maxRetries: 0 });
    outcome = `HTTP ${response.status()}`;
    if (response.ok()) return;
    if (response.status() < 500) {
      throw new Error(`Cleanup refund ${data.transactionId}: ${outcome}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Cleanup refund ')) throw error;
    // Playwright's full transport error includes cookie headers; do not log it.
    outcome = error instanceof Error && error.message.includes('ECONNRESET')
      ? 'ECONNRESET' : 'transport error';
  }

  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const refunds = await getApiArray<CleanupRefund>(
        api.get(`/api/protected/transactions/${data.transactionId}/refunds`, { timeout: 10_000 }), 'Refunds');
      const tickets = await getApiArray<OrderTicket>(
        api.get(`/api/protected/transactions/confirmation/${encodeURIComponent(confirmation)}`, { timeout: 10_000 }), 'Tickets');
      const refundedIds = new Set(refunds.filter(refund =>
        refund.EventId === data.eventId && refund.TransactionId === data.transactionId
        && refund.Complete && refund.RefundReferenceId && refund.RefundStatus === 'succeeded')
        .flatMap(refund => refund.TicketIds));
      if (data.ticketIds.every(id => refundedIds.has(id) && tickets.some(ticket =>
        ticket.Id === id && ticket.TransactionId === data.transactionId
        && ['RefundedBeforeEvent', 'RefundedDuringOrAfterEvent'].includes(ticket.Status)))) {
        console.log(`[cleanup] Verified refund ${data.transactionId} after ${outcome}; no POST retry needed.`);
        return;
      }
    } catch {
      // Only reads may be retried while the original refund finishes.
    }
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, deadline - Date.now())));
  } while (Date.now() <= deadline);

  throw new Error(`Cleanup refund ${data.transactionId}: outcome unconfirmed after ${outcome}; POST was not retried`);
}
