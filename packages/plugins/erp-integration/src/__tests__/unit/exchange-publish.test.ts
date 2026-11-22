import { describe, expect, it } from 'vitest';

import { parseExchangeHealth, viewSnapshot } from '../../exchange-health';
import { parseMappingErrors, parsePublishChannel } from '../../exchange-publish';

const stream = { stream: 's', entityType: 's', status: 'OK', lastActivityAt: null };
const base = (channels: Record<string, unknown>): unknown => ({
    generatedAt: '2026-11-20T10:00:05Z',
    status: 'OK',
    channels: {
        ingest: { status: 'OK', streams: [stream] },
        pull: { status: 'OK', streams: [] },
        ack: { status: 'OK', streams: [] },
        ...channels,
    },
    failures24h: { status: 'OK' },
    resyncSignals: {},
});

const publish = {
    status: 'DOWN',
    lastActivityAt: '2026-11-20T09:00:00Z',
    futureField: 1,
    aggregates: [
        {
            aggregateType: 'item',
            status: 'DEGRADED',
            mappingErrorsLast24h: 2,
            mappingErrorCodes: ['body-missing-attribute', 7],
            deadLetteredLast24h: 0,
            pending: 4,
            oldestPendingAgeSeconds: 1200,
            lastPublishedAt: null,
        },
        { aggregateType: 'order', status: 'bogus' },
        'junk',
    ],
};

describe('publish channel parsing', () => {
    it('maps aggregates, keeps string codes and skips malformed rows', () => {
        const parsed = parsePublishChannel(publish);
        expect(parsed?.status).toBe('DOWN');
        expect(parsed?.aggregates).toEqual([
            {
                aggregateType: 'item',
                status: 'DEGRADED',
                mappingErrorsLast24h: 2,
                mappingErrorCodes: ['body-missing-attribute'],
                deadLetteredLast24h: 0,
                pending: 4,
                oldestPendingAgeSeconds: 1200,
                lastPublishedAt: null,
            },
        ]);
    });

    it('treats a missing or malformed channel as absent, not as a bad response', () => {
        expect(parseExchangeHealth(base({})).publish).toBeNull();
        expect(parseExchangeHealth(base({ publish: 'x' })).publish).toBeNull();
        expect(parseExchangeHealth(base({ publish: { status: 'OK' } })).publish).toBeNull();
    });

    it('keeps the other channels strict when publish is present', () => {
        expect(() => parseExchangeHealth(base({ ack: undefined, publish }))).toThrow();
        expect(parseExchangeHealth(base({ publish })).publish?.aggregates).toHaveLength(1);
    });
});

describe('mapping errors parsing', () => {
    it('maps items, truncates long messages and ignores junk', () => {
        const errors = parseMappingErrors({
            items: [
                { kind: 'item', code: 'c', message: 'x'.repeat(500), occurrences: 3 },
                { kind: 'item' },
                null,
            ],
            total: 3,
        });
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toHaveLength(300);
        expect(errors[0].occurrences).toBe(3);
    });

    it('returns nothing for an unexpected body', () => {
        expect(parseMappingErrors('x')).toEqual([]);
        expect(parseMappingErrors({})).toEqual([]);
    });
});

describe('snapshot view of a pre-publish snapshot', () => {
    it('fills publish and mappingErrors for health stored before the channel existed', () => {
        const stored = {
            state: 'OK' as const,
            reason: null,
            health: { status: 'OK' } as never,
            polledAt: new Date(),
        };
        const view = viewSnapshot(stored, new Date(), 60_000);
        expect(view.health).toMatchObject({ publish: null, mappingErrors: [] });
    });
});
