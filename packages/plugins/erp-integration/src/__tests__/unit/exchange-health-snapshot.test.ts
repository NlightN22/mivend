import { describe, expect, it } from 'vitest';

import { viewSnapshot } from '../../exchange-health';
import type { StoredExchangeSnapshot } from '../../exchange-health';

const now = new Date('2026-11-20T10:00:00Z');
const interval = 60_000;
const stored = (over: Partial<StoredExchangeSnapshot> = {}): StoredExchangeSnapshot => ({
    state: 'DOWN',
    reason: null,
    health: null,
    polledAt: new Date(now.getTime() - 30_000),
    ...over,
});

describe('viewSnapshot', () => {
    it('is UNKNOWN NEVER_POLLED before the first poll, not OK', () => {
        expect(viewSnapshot(null, now, interval)).toMatchObject({
            state: 'UNKNOWN',
            reason: 'NEVER_POLLED',
        });
    });

    it.each(['OK', 'DEGRADED', 'DOWN'] as const)(
        'passes a fresh %s through without a reason',
        state => {
            expect(viewSnapshot(stored({ state }), now, interval)).toMatchObject({
                state,
                reason: null,
            });
        },
    );

    it('keeps the stored reason of a fresh UNKNOWN', () => {
        expect(
            viewSnapshot(stored({ state: 'UNKNOWN', reason: 'UNAUTHORIZED' }), now, interval),
        ).toMatchObject({
            state: 'UNKNOWN',
            reason: 'UNAUTHORIZED',
        });
    });

    it('turns a snapshot older than three intervals into UNKNOWN STALE, even if it was OK', () => {
        const old = stored({ state: 'OK', polledAt: new Date(now.getTime() - 3 * interval - 1) });
        expect(viewSnapshot(old, now, interval)).toMatchObject({
            state: 'UNKNOWN',
            reason: 'STALE',
            health: null,
        });
        const edge = stored({ state: 'OK', polledAt: new Date(now.getTime() - 3 * interval) });
        expect(viewSnapshot(edge, now, interval).state).toBe('OK');
    });
});
