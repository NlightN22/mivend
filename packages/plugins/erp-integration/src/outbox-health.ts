import { OUTBOUND_EVENT_TYPES } from './outbound-event-types';
import { OUTBOUND_EVENT_SCHEMAS } from './schemas/registry';

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
    // 'contract' = schema comes from @nlightn22/event-contracts, 'local' = this plugin's own copy.
    schemaSource: 'contract' | 'local' | null;
}

const schemaSourceOf = (eventType: string): 'contract' | 'local' | null =>
    (OUTBOUND_EVENT_SCHEMAS as Record<string, { source: 'contract' | 'local' } | undefined>)[
        eventType
    ]?.source ?? null;

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
    schemaSource: schemaSourceOf(eventType),
});

// Every registered outbound type is listed even with no events, plus any type found in the outbox
// that is no longer registered (a stale or renamed type must not hide).
export function mergeOutboxHealth(
    dbRows: readonly OutboxHealthByEventType[],
    registered: readonly string[] = Object.keys(OUTBOUND_EVENT_TYPES),
): OutboxHealthByEventType[] {
    const byType = new Map(dbRows.map(row => [row.eventType, row]));
    const types = [...new Set([...registered, ...byType.keys()])].sort();
    return types.map(type => {
        const row = byType.get(type);
        return row ? { ...row, schemaSource: schemaSourceOf(type) } : emptyRow(type);
    });
}
