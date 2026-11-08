import { describe, expect, it } from 'vitest';
import type { SelectQueryBuilder } from 'typeorm';

import type { SettlementDocumentEntry } from '../../entities/settlement-document-entry.entity';
import { applyListFilter, applyListSort } from '../../settlement-list-query';

function fakeQb(): {
    qb: SelectQueryBuilder<SettlementDocumentEntry>;
    where: { sql: string; params: Record<string, unknown> }[];
    order: string[];
} {
    const where: { sql: string; params: Record<string, unknown> }[] = [];
    const order: string[] = [];
    const qb = {
        andWhere: (sql: string, params: Record<string, unknown>) => where.push({ sql, params }),
        orderBy: (sql: string, dir: string) => order.push(`${sql} ${dir}`),
        addOrderBy: (sql: string, dir: string) => order.push(`${sql} ${dir}`),
    } as unknown as SelectQueryBuilder<SettlementDocumentEntry>;
    return { qb, where, order };
}

describe('settlement list query', () => {
    it('binds every filter value and never puts it into the SQL', () => {
        const { qb, where } = fakeQb();
        applyListFilter(qb, { number: { contains: "1'; DROP TABLE x;--" }, amount: { gt: 5 } });
        expect(where).toHaveLength(1);
        expect(where[0].sql).not.toContain('DROP');
        expect(Object.values(where[0].params)).toEqual(["%1'; DROP TABLE x;--%", 5]);
    });

    it('rejects a field outside the whitelist and an unsortable column', () => {
        expect(() => applyListFilter(fakeQb().qb, { bogus: { eq: 'x' } })).toThrow(
            'Unknown filter',
        );
        expect(() => applyListSort(fakeQb().qb, { documentType: 'ASC' })).toThrow('Cannot sort by');
    });

    it('sorts newest first by default, with the entry id as the stable tie-break', () => {
        const { qb, order } = fakeQb();
        applyListSort(qb, undefined);
        expect(order).toEqual(['"d"."date" DESC', '"e"."id" DESC']);
    });
});
