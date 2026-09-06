import { adminApi } from './client';

// Three independent, unrelated-plugin "system health" panels for the dashboard (issue #76) —
// kept in one file per the task's own file-size guidance, not folded into the big shared
// DASHBOARD_QUERY in dashboard.ts since each comes from a different plugin and is gated on a
// different permission.
//
// NOTE: these three Admin API queries (failedIntegrationInboxEvents,
// openReservationReconciliationIssues, openPaymentReconciliationIssues) are being added by a
// separate backend agent in parallel and may not be merged yet — field names below are the ones
// specified for this task; if the actual schema differs, this file needs a follow-up update.

export interface FailedIntegrationInboxEvent {
    id: string;
    stream: string;
    entityId: string;
    lastError: string | null;
    attempts: number;
    updatedAt: string;
}

export async function fetchFailedIntegrationInboxEvents(
    take: number,
): Promise<FailedIntegrationInboxEvent[]> {
    const result = await adminApi<{
        failedIntegrationInboxEvents: { items: FailedIntegrationInboxEvent[] };
    }>(
        `query FailedIntegrationInboxEvents($options: FailedIntegrationInboxEventListOptions) {
            failedIntegrationInboxEvents(options: $options) {
                items {
                    id
                    stream
                    entityId
                    lastError
                    attempts
                    updatedAt
                }
            }
        }`,
        { options: { take } },
    );
    return result.failedIntegrationInboxEvents.items;
}

export interface ReservationReconciliationIssue {
    id: string;
    issueType: string;
    orderId: string;
    productVariantId: string | null;
    localQuantity: number | null;
    erpQuantity: number | null;
    detectedAt: string;
}

export async function fetchOpenReservationReconciliationIssues(
    take: number,
): Promise<ReservationReconciliationIssue[]> {
    const result = await adminApi<{
        openReservationReconciliationIssues: { items: ReservationReconciliationIssue[] };
    }>(
        `query OpenReservationReconciliationIssues($options: OpenReservationReconciliationIssueListOptions) {
            openReservationReconciliationIssues(options: $options) {
                items {
                    id
                    issueType
                    orderId
                    productVariantId
                    localQuantity
                    erpQuantity
                    detectedAt
                }
            }
        }`,
        { options: { take } },
    );
    return result.openReservationReconciliationIssues.items;
}

export interface PaymentReconciliationIssue {
    id: string;
    issueType: string;
    paymentId: string | null;
    invoiceId: string | null;
    expectedAmount: number | null;
    actualAmount: number | null;
    detectedAt: string;
}

export async function fetchOpenPaymentReconciliationIssues(
    take: number,
): Promise<PaymentReconciliationIssue[]> {
    const result = await adminApi<{
        openPaymentReconciliationIssues: { items: PaymentReconciliationIssue[] };
    }>(
        `query OpenPaymentReconciliationIssues($options: OpenPaymentReconciliationIssueListOptions) {
            openPaymentReconciliationIssues(options: $options) {
                items {
                    id
                    issueType
                    paymentId
                    invoiceId
                    expectedAmount
                    actualAmount
                    detectedAt
                }
            }
        }`,
        { options: { take } },
    );
    return result.openPaymentReconciliationIssues.items;
}
