import { describe, expect, it, vi } from 'vitest';
import { QueryTooLargeError } from 'shared';

import { sumActiveReservations } from '../../active-reservation-sums';
import { RejectedOrderReleaseService } from '../../rejected-order-release.service';
import { findRejectedOrderIdsWithActiveReserve } from '../../rejected-orders.query';
import { lockStockLevelsInOrder } from '../../reservation-location-picker';
import { VARIANT_LOCATION_CEILING } from '../../reservation-read-ceiling';
import { ReservationSettings } from '../../reservation-settings';

const rows = (n: number, start = 0): Array<{ id: number }> =>
    Array.from({ length: n }, (_, i) => ({ id: start + i + 1 }));

function chain(terminal: Record<string, unknown>): Record<string, unknown> {
    const qb: Record<string, unknown> = { ...terminal };
    for (const m of ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy']) {
        qb[m] = vi.fn(() => qb);
    }
    for (const m of ['setLock', 'orderBy', 'take', 'limit', 'setParameter']) {
        qb[m] = vi.fn(() => qb);
    }
    qb.getQuery = vi.fn(() => 'SELECT 1');
    return qb;
}

const ctx = {} as never;

describe('getRawManyBounded: sumActiveReservations', () => {
    const run = (n: number): Promise<Map<string, number>> => {
        const qb = chain({ getRawMany: vi.fn(async () => rows(n)) });
        const connection = { getRepository: () => ({ createQueryBuilder: () => qb }) };
        return sumActiveReservations(connection as never, ctx, ['v'], ['l']);
    };

    it('passes at the ceiling and throws one over', async () => {
        await expect(run(VARIANT_LOCATION_CEILING)).resolves.toBeInstanceOf(Map);
        await expect(run(VARIANT_LOCATION_CEILING + 1)).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});

describe('getManyBounded: lockStockLevelsInOrder (order path)', () => {
    const run = (n: number): Promise<void> => {
        const qb = chain({ getMany: vi.fn(async () => rows(n)) });
        const connection = { getRepository: () => ({ createQueryBuilder: () => qb }) };
        return lockStockLevelsInOrder(connection as never, ctx, ['1'], ['2']);
    };

    it('passes at the ceiling and throws one over, failing the surrounding operation', async () => {
        await expect(run(VARIANT_LOCATION_CEILING)).resolves.toBeUndefined();
        await expect(run(VARIANT_LOCATION_CEILING + 1)).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});

describe('ctxQueryBounded: rejected status codes', () => {
    const run = (n: number): Promise<number> => {
        const query = vi.fn(async () => Array.from({ length: n }, () => ({ code: 'X' })));
        const qb = chain({ getMany: vi.fn(async () => []) });
        const connection = { getRepository: () => ({ query, createQueryBuilder: () => qb }) };
        const service = new RejectedOrderReleaseService(
            connection as never,
            { create: vi.fn(async () => ({})) } as never,
            {} as never,
            {} as never,
            new ReservationSettings({ rejectedOrderReleaseDays: 3 }),
        );
        return service.releaseDue();
    };

    it('passes at the ceiling and throws one over', async () => {
        await expect(run(1000)).resolves.toBe(0);
        await expect(run(1001)).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});

describe('readAllByKeyset: rejected-order sweep', () => {
    function sweep(batches: number): {
        run: () => Promise<string[]>;
        afterIds: unknown[];
    } {
        const afterIds: unknown[] = [];
        let call = 0;
        const qb = chain({});
        qb.andWhere = vi.fn((sql: string, params?: { afterId?: number }) => {
            if (params && 'afterId' in params) afterIds.push(params.afterId);
            return qb;
        });
        qb.getMany = vi.fn(async () => {
            call += 1;
            return call <= batches ? rows(1000, (call - 1) * 1000) : [];
        });
        const connection = { getRepository: () => ({ createQueryBuilder: () => qb }) };
        return {
            run: () =>
                findRejectedOrderIdsWithActiveReserve(connection as never, ctx, ['R'], new Date()),
            afterIds,
        };
    }

    it('reads every batch up to the ceiling, continuing after the last id', async () => {
        const { run, afterIds } = sweep(10);
        expect(await run()).toHaveLength(10000);
        expect(afterIds.slice(0, 2)).toEqual([1000, 2000]);
    });

    it('throws once the set passes the ceiling', async () => {
        await expect(sweep(11).run()).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});
