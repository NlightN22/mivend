import { adminApi } from './client';
import {
    FailedIntegrationInboxEventsDocument,
    OrderCheckHealthDocument,
    RunErpReconciliationDocument,
} from './generated/graphql';

// Issues are read via notifications(status:): plugin-notification writes one row per issue type.
// runErpReconciliation is a manual-trigger mutation outside the read/notify scope; leave it.

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

export interface OrderCheckHealthRow {
    checkCode: string;
    reason: string | null;
    orderCount: number;
    staleOrderCount: number;
}

export async function fetchOrderCheckHealth(): Promise<OrderCheckHealthRow[]> {
    const result = await adminApi(OrderCheckHealthDocument);
    return result.orderCheckHealth;
}
