import { describe, it, expect } from 'vitest';
import type { SelectQueryBuilder } from 'typeorm';

import type { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { applyListFilter, applyListSort } from '../../proforma-invoice-list-query';

function recorder(): {
    qb: SelectQueryBuilder<ProformaInvoice>;
    where: Array<[string, Record<string, unknown>]>;
    order: string[];
} {
    const where: Array<[string, Record<string, unknown>]> = [];
    const order: string[] = [];
    const qb = {
        andWhere: (sql: string, params: Record<string, unknown>) => where.push([sql, params]),
        orderBy: (sql: string, dir: string) => order.push(`${sql} ${dir}`),
        addOrderBy: (sql: string, dir: string) => order.push(`${sql} ${dir}`),
    } as unknown as SelectQueryBuilder<ProformaInvoice>;
    return { qb, where, order };
}

describe('applyListFilter', () => {
    it('does nothing without a filter', () => {
        const { qb, where } = recorder();
        applyListFilter(qb, undefined);
        expect(where).toEqual([]);
    });

    it('binds every value and never puts client text in the SQL', () => {
        const { qb, where } = recorder();
        applyListFilter(qb, { number: { contains: "x'; DROP" }, amount: { gt: 5 } });
        const [sql, params] = where[0];
        expect(sql).not.toContain('DROP');
        expect(Object.values(params)).toEqual(["%x'; DROP%", 5]);
    });

    it('escapes LIKE wildcards in contains', () => {
        const { qb, where } = recorder();
        applyListFilter(qb, { customer: { contains: '50%_' } });
        expect(Object.values(where[0][1])).toEqual(['%50\\%\\_%']);
    });

    it('rejects unknown fields and operators', () => {
        expect(() => applyListFilter(recorder().qb, { evil: { eq: '1' } })).toThrow(/Unknown/);
        expect(() => applyListFilter(recorder().qb, { number: { gt: '1' } })).toThrow(
            /Unsupported/,
        );
    });

    it('rejects a malformed date or number', () => {
        expect(() => applyListFilter(recorder().qb, { createdAt: { before: 'nope' } })).toThrow();
        expect(() => applyListFilter(recorder().qb, { amount: { eq: 'abc' } })).toThrow();
    });

    it('undoes the display dash of a number', () => {
        const { qb, where } = recorder();
        applyListFilter(qb, { number: { eq: '100-0000303-01-1' } });
        expect(Object.values(where[0][1])).toEqual(['1000000303-01-1']);
    });
});

describe('applyListSort', () => {
    it('defaults to newest first with an id tiebreaker', () => {
        const { qb, order } = recorder();
        applyListSort(qb, undefined);
        expect(order).toEqual([
            '"proformaInvoice"."createdAt" DESC',
            '"proformaInvoice"."id" DESC',
        ]);
    });

    it('only sorts by whitelisted fields', () => {
        const { qb, order } = recorder();
        applyListSort(qb, { amount: 'ASC' });
        expect(order[0]).toBe('"proformaInvoice"."amount" ASC');
        expect(() => applyListSort(recorder().qb, { orderCode: 'ASC' })).toThrow(/Cannot sort/);
    });
});
