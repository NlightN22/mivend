import { describe, expect, it } from 'vitest';

import { mergeOutboxHealth } from '../../outbox-health';
import type { OutboxHealthByEventType } from '../../outbox-health';

const row = (
    eventType: string,
    overrides: Partial<OutboxHealthByEventType> = {},
): OutboxHealthByEventType => ({
    eventType,
    pending: 0,
    failed: 0,
    skipped: 0,
    oldestPendingAt: null,
    lastPublishedAt: null,
    lastError: null,
    lastErrorAt: null,
    lastSkipReason: null,
    schemaSource: null,
    ...overrides,
});

describe('mergeOutboxHealth', () => {
    it('lists a registered type with zeros when the outbox has no rows for it', () => {
        expect(mergeOutboxHealth([], ['order.confirmed'])).toEqual([
            row('order.confirmed', { schemaSource: 'local' }),
        ]);
    });

    it('keeps the database figures for a registered type', () => {
        const merged = mergeOutboxHealth(
            [row('order.confirmed', { skipped: 2 })],
            ['order.confirmed'],
        );
        expect(merged).toEqual([row('order.confirmed', { skipped: 2, schemaSource: 'local' })]);
    });

    it('keeps a type that is in the outbox but no longer registered', () => {
        const merged = mergeOutboxHealth([row('legacy.event', { failed: 1 })], ['order.confirmed']);
        expect(merged.map(r => r.eventType)).toEqual(['legacy.event', 'order.confirmed']);
    });
});
