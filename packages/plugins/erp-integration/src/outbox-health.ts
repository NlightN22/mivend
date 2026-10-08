import { OUTBOUND_EVENT_TYPES } from './outbound-event-types';

export interface OutboxHealthByEventType {
    eventType: string;
    pending: number;
    failed: number;
    skipped: number;
    oldestPendingAt: Date | null;
    lastPublishedAt: Date | null;
    lastError: string | null;
    lastErrorAt: Date | null;
    lastSkipReason: string | null;
}

const emptyRow = (eventType: string): OutboxHealthByEventType => ({
    eventType,
    pending: 0,
    failed: 0,
    skipped: 0,
    oldestPendingAt: null,
    lastPublishedAt: null,
    lastError: null,
    lastErrorAt: null,
    lastSkipReason: null,
});

// Every registered outbound type is listed even with no events, plus any type found in the outbox
// that is no longer registered (a stale or renamed type must not hide).
export function mergeOutboxHealth(
    dbRows: readonly OutboxHealthByEventType[],
    registered: readonly string[] = Object.keys(OUTBOUND_EVENT_TYPES),
): OutboxHealthByEventType[] {
    const byType = new Map(dbRows.map(row => [row.eventType, row]));
    const types = [...new Set([...registered, ...byType.keys()])].sort();
    return types.map(type => byType.get(type) ?? emptyRow(type));
}
