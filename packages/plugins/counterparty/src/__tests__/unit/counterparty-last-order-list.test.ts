import { describe, expect, it, vi } from 'vitest';
import type { SelectQueryBuilder } from 'typeorm';

import { applyCounterpartyFilterParameter } from '../../counterparty-list-query';
import { applyCounterpartySort } from '../../counterparty-sort';
import type { Counterparty } from '../../entities/counterparty.entity';

function fakeQb() {
    const andWhere = vi.fn<(sql: string, params?: Record<string, unknown>) => unknown>();
    const addSelect = vi.fn<(sql: string, alias: string) => unknown>();
    const orderBy = vi.fn<(key: string, order: string, nulls?: string) => unknown>();
    const qb = { andWhere, addSelect, orderBy };
    andWhere.mockReturnValue(qb);
    addSelect.mockReturnValue(qb);
    orderBy.mockReturnValue(qb);
    return { qb: qb as unknown as SelectQueryBuilder<Counterparty>, andWhere, addSelect, orderBy };
}

describe('counterparty lastOrderAt list mapping', () => {
    it.each([
        [{ before: '2026-01-10T00:00:00Z' }, '<'],
        [{ after: '2026-01-10T00:00:00Z' }, '>'],
    ])('maps %j to a bound comparison on the placed-order subquery', (op, symbol) => {
        const { qb, andWhere } = fakeQb();
        applyCounterpartyFilterParameter(qb, { lastOrderAt: op });
        const sql = andWhere.mock.calls[0][0];
        expect(sql).toContain('MAX(o."orderPlacedAt")');
        expect(sql).toContain('o."orderPlacedAt" IS NOT NULL');
        expect(sql).toContain(` ${symbol} :`);
        expect(sql).not.toContain('2026');
    });

    it('maps isNull to IS NULL on the subquery', () => {
        const { qb, andWhere } = fakeQb();
        applyCounterpartyFilterParameter(qb, { lastOrderAt: { isNull: true } });
        expect(andWhere.mock.calls[0][0]).toMatch(/\) IS NULL/);
    });

    it('rejects an equality operator the date field does not offer', () => {
        const { qb } = fakeQb();
        expect(() =>
            applyCounterpartyFilterParameter(qb, { lastOrderAt: { eq: '2026-01-10T00:00:00Z' } }),
        ).toThrow(/Unsupported filter operator/);
    });

    it.each(['ASC', 'DESC'] as const)('sorts %s with never-ordered last', order => {
        const { qb, addSelect, orderBy } = fakeQb();
        applyCounterpartySort(qb, { lastOrderAt: order });
        expect(addSelect).toHaveBeenCalledOnce();
        expect(orderBy).toHaveBeenCalledWith('"lastOrderAtSort"', order, 'NULLS LAST');
    });
});
