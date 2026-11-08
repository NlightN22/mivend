import { describe, expect, it, vi } from 'vitest';
import type { SelectQueryBuilder } from 'typeorm';

import { applyListSort, runPage } from '../../approval-list-options';
import type { ApprovalRequest } from '../../entities/approval-request.entity';

function fakeQb(): {
    qb: SelectQueryBuilder<ApprovalRequest>;
    orders: string[][];
    paging: { take?: number; skip?: number };
    getMany: ReturnType<typeof vi.fn>;
} {
    const orders: string[][] = [];
    const paging: { take?: number; skip?: number } = {};
    const getMany = vi.fn(async () => [{ id: 1 }]);
    const qb = {
        orderBy: (c: string, d: string, n?: string) => (orders.push([c, d, n ?? '']), qb),
        addOrderBy: (c: string, d: string, n?: string) => (orders.push([c, d, n ?? '']), qb),
        getCount: async () => 7,
        take: (n: number) => ((paging.take = n), qb),
        skip: (n: number) => ((paging.skip = n), qb),
        getMany,
    };
    return { qb: qb as unknown as SelectQueryBuilder<ApprovalRequest>, orders, paging, getMany };
}

describe('applyListSort', () => {
    it('sorts by a whitelisted field with an id tie-break', () => {
        const { qb, orders } = fakeQb();
        applyListSort(qb, { sortField: 'status', sortDir: 'ASC' });
        expect(orders).toEqual([
            ['request.status', 'ASC', 'NULLS LAST'],
            ['request.id', 'ASC', ''],
        ]);
    });

    it('falls back to newest first for unknown fields, never interpolating the input', () => {
        const { qb, orders } = fakeQb();
        applyListSort(qb, { sortField: 'id; DROP TABLE x', sortDir: 'sideways' });
        expect(orders[0]).toEqual(['request.createdAt', 'DESC', 'NULLS LAST']);
    });
});

describe('runPage', () => {
    it('clamps take to 200 and skip to 0', async () => {
        const { qb, paging } = fakeQb();
        await runPage(qb, { take: 100000, skip: -5 });
        expect(paging).toEqual({ take: 200, skip: 0 });
    });

    it('returns only the count for take 0 without loading rows', async () => {
        const { qb, getMany } = fakeQb();
        expect(await runPage(qb, { take: 0 })).toEqual({ items: [], totalItems: 7 });
        expect(getMany).not.toHaveBeenCalled();
    });

    it('defaults to 50 rows', async () => {
        const { qb, paging } = fakeQb();
        await runPage(qb, {});
        expect(paging.take).toBe(50);
    });
});
