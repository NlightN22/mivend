import { describe, expect, it } from 'vitest';
import type { SelectQueryBuilder } from 'typeorm';

import {
    applyPowerOfAttorneyFilter,
    applyPowerOfAttorneySort,
} from '../../power-of-attorney-list/power-of-attorney-list-query';
import { toItem } from '../../power-of-attorney-list/power-of-attorney-list.service';

function fakeQb(): {
    qb: SelectQueryBuilder<object>;
    where: { sql: string; params: Record<string, unknown> }[];
    order: string[];
} {
    const where: { sql: string; params: Record<string, unknown> }[] = [];
    const order: string[] = [];
    const qb = {
        andWhere: (sql: string, params: Record<string, unknown>) => where.push({ sql, params }),
        orderBy: (sql: string, dir: string) => order.push(`${sql} ${dir}`),
        addOrderBy: (sql: string, dir: string) => order.push(`${sql} ${dir}`),
    } as unknown as SelectQueryBuilder<object>;
    return { qb, where, order };
}

describe('power of attorney list query', () => {
    it('binds values, keeps hostile text out of the SQL and refuses unknown fields', () => {
        const { qb, where } = fakeQb();
        applyPowerOfAttorneyFilter(qb, { holder: { contains: "x'; DROP TABLE t;--" } });
        expect(where[0].sql).not.toContain('DROP');
        expect(Object.values(where[0].params)).toEqual(["%x'; DROP TABLE t;--%"]);
        expect(() => applyPowerOfAttorneyFilter(fakeQb().qb, { bogus: { eq: 'x' } })).toThrow(
            'Unknown filter',
        );
    });

    it('filters by the computed status with equality only', () => {
        expect(() =>
            applyPowerOfAttorneyFilter(fakeQb().qb, { status: { eq: 'expired' } }),
        ).not.toThrow();
        expect(() =>
            applyPowerOfAttorneyFilter(fakeQb().qb, { status: { contains: 'exp' } }),
        ).toThrow();
    });

    it('sorts by validity end with the id as tie-break and refuses unsortable columns', () => {
        const { qb, order } = fakeQb();
        applyPowerOfAttorneySort(qb, undefined);
        expect(order).toEqual(['"t"."validUntil" DESC', '"t"."id" DESC']);
        expect(() => applyPowerOfAttorneySort(fakeQb().qb, { status: 'ASC' })).toThrow(
            'Cannot sort by',
        );
    });

    it('maps a row to an item with the scan indicator', () => {
        const item = toItem({
            id: 3,
            number: '7',
            holderName: 'Holder',
            status: 'expired',
            scanId: 's1',
            contractDeleted: true,
        });
        expect(item).toMatchObject({
            id: '3',
            hasScan: true,
            scanId: 's1',
            contractDeleted: true,
            validUntil: null,
            contractName: null,
        });
        expect(toItem({ id: 4, number: '8', holderName: '', status: 'active' }).hasScan).toBe(
            false,
        );
    });
});
