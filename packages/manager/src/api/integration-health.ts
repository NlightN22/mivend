import { adminApi } from './client';
import {
    FailedIntegrationInboxEventsDocument,
    RunErpReconciliationDocument,
} from './generated/graphql';

// Dashboard "system health" panel for the failed-inbox-events widget (issue #76) — kept in one
// file per the task's own file-size guidance. The reservation/payment/ERP reconciliation issue
// queries this file used to hand-roll were migrated to the generic notifications(status:) query
// (see api/notifications.ts) once plugin-notification started producing a Notification row for
// each of these issue types (issue #87) — see ReservationReconciliationPanel.vue,
// PaymentReconciliationPanel.vue and ErpReconciliationPanel.vue.
//
// runErpReconciliation (issue #84) is a manual-trigger mutation, out of scope for #87 (read/notify
// side only) — kept here untouched.

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
    const result = await adminApi(FailedIntegrationInboxEventsDocument, { options: { take } });
    return result.failedIntegrationInboxEvents.items;
}

export interface ErpReconciliationRunResult {
    checked: number;
    issuesFound: number;
    skipped: string[];
}

export async function runErpReconciliation(): Promise<ErpReconciliationRunResult> {
    const result = await adminApi(RunErpReconciliationDocument);
    return result.runErpReconciliation;
}
