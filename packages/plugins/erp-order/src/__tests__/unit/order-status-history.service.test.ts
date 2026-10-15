import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { nextExternalErpStatus } from '../../external-order-state';
import { OrderStatusHistoryService } from '../../order-status-history.service';
import { testOrderStatusDictionary } from '../../testing/order-status-fixture';

vi.mock('shared', async importOriginal => ({
    ...(await importOriginal<typeof import('shared')>()),
    withAggregateLock: (_c: unknown, ctx: unknown, _key: unknown, work: (c: unknown) => unknown) =>
        work(ctx),
}));

type Row = { id: number; status: string; previousStatus: string | null; occurredAt: Date };

function service(): { service: OrderStatusHistoryService; rows: Row[] } {
    const rows: Row[] = [];
    const repo = {
        findOne: async () => rows[rows.length - 1],
        insert: async (row: Omit<Row, 'id'>) => {
            rows.push({ id: rows.length + 1, ...row });
        },
    };
    const connection = { getRepository: () => repo };
    return { service: new OrderStatusHistoryService(connection as never), rows };
}

const ctx = {} as RequestContext;

describe('OrderStatusHistoryService.record', () => {
    it('keeps A, B, A as three rows and skips only an immediate repeat', async () => {
        const { service: history, rows } = service();
        for (const status of ['A', 'B', 'B', 'A']) await history.record(ctx, 1, status);
        expect(rows.map(r => [r.previousStatus, r.status])).toEqual([
            [null, 'A'],
            ['A', 'B'],
            ['B', 'A'],
        ]);
    });

    it('stores the ERP event time and falls back to now', async () => {
        const { service: history, rows } = service();
        const erpTime = new Date('2026-01-02T03:04:05Z');
        await history.record(ctx, 1, 'A', erpTime);
        await history.record(ctx, 1, 'B');
        expect(rows[0].occurredAt).toEqual(erpTime);
        expect(Date.now() - rows[1].occurredAt.getTime()).toBeLessThan(5000);
    });
});

describe('stale events', () => {
    it('are blocked by the forward-only rule, not by the history', () => {
        const dictionary = testOrderStatusDictionary();
        expect(nextExternalErpStatus('PICKING', 'UNDER_APPROVAL', dictionary)).toBeNull();
        expect(nextExternalErpStatus('UNDER_APPROVAL', 'PICKING', dictionary)).toBe('PICKING');
    });
});
