import { describe, expect, it } from 'vitest';

import { shouldLogLag } from '../../slow-request-log/event-loop-lag';
import {
    actorLabel,
    envMs,
    formatSlowOperation,
    isSlow,
} from '../../slow-request-log/slow-request-log';

describe('slow request decision', () => {
    it('logs only above the threshold', () => {
        expect(isSlow(500, 500)).toBe(false);
        expect(isSlow(501, 500)).toBe(true);
    });

    it('falls back on a missing or invalid env value', () => {
        expect(envMs(undefined, 500)).toBe(500);
        expect(envMs('abc', 500)).toBe(500);
        expect(envMs('250', 500)).toBe(250);
    });
});

describe('actor and operation labels', () => {
    it('labels anonymous, customer and staff roles without ids', () => {
        expect(actorLabel(undefined)).toBe('anonymous');
        expect(actorLabel({ session: { user: undefined } })).toBe('anonymous');
        expect(
            actorLabel({ session: { user: { channelPermissions: [{ code: '__customer_role__' }] } } }),
        ).toBe('customer');
        expect(
            actorLabel({
                session: { user: { channelPermissions: [{ code: 'sales' }, { code: 'sales' }] } },
            }),
        ).toBe('sales');
    });

    it('prints only a sane operation name', () => {
        expect(formatSlowOperation('admin', 'GetOrders', 1234.4, 'sales')).toBe(
            'admin GetOrders took 1234 ms (actor: sales)',
        );
        expect(formatSlowOperation('shop', null, 900, 'customer')).toContain('anonymous-operation');
        expect(formatSlowOperation('shop', 'x {a:"secret@mail"}', 900, 'customer')).not.toContain('secret');
    });
});

describe('event loop lag rate limit', () => {
    it('ignores lag at or under the threshold', () => {
        expect(shouldLogLag(1000, 1000, 50_000, null)).toBe(false);
    });

    it('logs the first stall, then at most once per 10 seconds', () => {
        expect(shouldLogLag(1500, 1000, 50_000, null)).toBe(true);
        expect(shouldLogLag(1500, 1000, 55_000, 50_000)).toBe(false);
        expect(shouldLogLag(1500, 1000, 60_000, 50_000)).toBe(true);
    });
});
