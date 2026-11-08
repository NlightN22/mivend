import { describe, it, expect } from 'vitest';
import type { SelectQueryBuilder } from 'typeorm';

import type { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { applyListFilter, applyListSort } from '../../payment-list-query';

function recorder(): {
    qb: SelectQueryBuilder<PaymentAttempt>;
    where: Array<[string, Record<string, unknown>]>;
    order: string[];
} {
    const where: Array<[string, Record<string, unknown>]> = [];
    const order: string[] = [];
    const qb = {
        andWhere: (sql: string, params: Record<string, unknown>) => where.push([sql, params]),
        orderBy: (sql: string, dir: string) => order.push(`${sql} ${dir}`),
        addOrderBy: (sql: string, dir: string) => order.push(`${sql} ${dir}`),
    } as unknown as SelectQueryBuilder<PaymentAttempt>;
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

    it('keeps a plain numeric number as typed', () => {
        const { qb, where } = recorder();
        applyListFilter(qb, { number: { eq: '1000303' } });
        expect(Object.values(where[0][1])).toEqual(['1000303']);
    });
});

describe('applyListFilter operator semantics', () => {
    it('rejects regex like any unsupported operator', () => {
        expect(() => applyListFilter(recorder().qb, { customer: { regex: '.*' } })).toThrow(
            /Unsupported/,
        );
    });

    it('treats after as strictly later and before as strictly earlier', () => {
        const { qb, where } = recorder();
        applyListFilter(qb, { createdAt: { after: '2026-01-02T00:00:00.000Z' } });
        applyListFilter(qb, { createdAt: { before: '2026-01-02T00:00:00.000Z' } });
        expect(where[0][0]).toMatch(/"createdAt" > :/);
        expect(where[1][0]).toMatch(/"createdAt" < :/);
    });

    it('keeps NULL rows for notEq and notIn on text fields', () => {
        const { qb, where } = recorder();
        applyListFilter(qb, { customerInn: { notEq: '1' } });
        applyListFilter(qb, { customerInn: { notIn: ['1', '2'] } });
        expect(where[0][0]).toMatch(/IS NULL OR .*<>/);
        expect(where[1][0]).toMatch(/IS NULL OR NOT/);
    });
});

describe('applyListSort', () => {
    it('defaults to newest first with an id tiebreaker', () => {
        const { qb, order } = recorder();
        applyListSort(qb, undefined);
        expect(order).toEqual(['"payment"."createdAt" DESC', '"payment"."id" DESC']);
    });

    it('only sorts by whitelisted fields', () => {
        const { qb, order } = recorder();
        applyListSort(qb, { amount: 'ASC' });
        expect(order[0]).toBe('"payment"."amount" ASC');
        expect(() => applyListSort(recorder().qb, { orderCode: 'ASC' })).toThrow(/Cannot sort/);
    });
});
