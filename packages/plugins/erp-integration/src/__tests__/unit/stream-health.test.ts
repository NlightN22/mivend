import { describe, expect, it } from 'vitest';

import { buildStreamHealthRows } from '../../stream-health';
import type { StreamHealthInput } from '../../stream-health';

function input(overrides: Partial<StreamHealthInput>): StreamHealthInput {
    return {
        contractStreams: [],
        consumedStreams: [],
        ignoredStreams: {},
        topics: {},
        lagByStream: new Map(),
        backlogByStream: new Map(),
        ...overrides,
    };
}

const find = (rows: ReturnType<typeof buildStreamHealthRows>, s: string) =>
    rows.find(r => r.stream === s)!;

describe('buildStreamHealthRows', () => {
    it('keeps a consumed stream with zero backlog and no drift', () => {
        const rows = buildStreamHealthRows(
            input({ contractStreams: ['bank'], consumedStreams: ['bank'], topics: { bank: 't' } }),
        );
        expect(rows).toEqual([
            expect.objectContaining({
                stream: 'bank',
                topic: 't',
                pending: 0,
                failed: 0,
                drift: null,
            }),
        ]);
    });

    it('flags a contract stream that is not consumed and not ignored', () => {
        const rows = buildStreamHealthRows(input({ contractStreams: ['order-change-result'] }));
        expect(find(rows, 'order-change-result').drift).toBe('NOT_CONSUMED');
    });

    it('does not flag an explicitly ignored contract stream', () => {
        const rows = buildStreamHealthRows(
            input({ contractStreams: ['x'], ignoredStreams: { x: 'outbound only' } }),
        );
        expect(find(rows, 'x')).toMatchObject({ drift: null, ignoredReason: 'outbound only' });
    });

    it('flags a consumed stream missing from the contract', () => {
        const rows = buildStreamHealthRows(input({ consumedStreams: ['old'] }));
        expect(find(rows, 'old').drift).toBe('NOT_IN_CONTRACT');
    });

    it('flags inbox rows for a stream that is neither in contract nor configured', () => {
        const backlogByStream = new Map([
            ['ghost', { pending: 2, processing: 0, failed: 1, oldestPendingAt: new Date(0) }],
        ]);
        const rows = buildStreamHealthRows(input({ backlogByStream }));
        expect(find(rows, 'ghost')).toMatchObject({
            drift: 'UNKNOWN_STREAM',
            pending: 2,
            failed: 1,
        });
    });

    it('flags a stream that only has Kafka lag data', () => {
        const lag = { topic: 't', totalLag: '3', polledAt: new Date(0), partitions: [] };
        const rows = buildStreamHealthRows(input({ lagByStream: new Map([['lag-only', lag]]) }));
        expect(find(rows, 'lag-only').drift).toBe('UNKNOWN_STREAM');
    });
});
