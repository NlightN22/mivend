import { describe, expect, it } from 'vitest';
import type { SelectQueryBuilder } from 'typeorm';

import type { ListQueryConfig } from '../../list-filter-engine';
import {
    applySuggest,
    clampSuggestLimit,
    dedupeSuggestions,
    normalizeSuggestPrefix,
    suggestSpecFor,
} from '../../list-suggest';

const SPEC = { valueSql: '"c"."name"', whereSql: '"c"."active" IS TRUE' };
const CONFIG: ListQueryConfig = {
    fields: {
        name: { kind: 'string', sql: '"c"."name"', suggest: SPEC },
        code: { kind: 'string', sql: '"c"."code"' },
    },
    sortable: [],
    paramPrefix: 'f',
    defaultSql: '"c"."id"',
    tiebreakerSql: '"c"."id"',
    limits: { maxTextLength: 10 },
};

function fakeQb() {
    const calls: { where: [string, unknown?][]; order: string[]; limit: number[]; select: string[] } =
        { where: [], order: [], limit: [], select: [] };
    const qb = {
        select: (sql: string) => (calls.select.push(sql), qb),
        andWhere: (sql: string, params?: unknown) => (calls.where.push([sql, params]), qb),
        orderBy: (sql: string) => (calls.order.push(sql), qb),
        limit: (n: number) => (calls.limit.push(n), qb),
    };
    return { qb: qb as unknown as SelectQueryBuilder<object>, calls };
}

describe('list suggestions', () => {
    it('clamps the limit to 1..20 with a default of 10', () => {
        expect(clampSuggestLimit(undefined)).toBe(10);
        expect(clampSuggestLimit(500)).toBe(20);
        expect(clampSuggestLimit(0)).toBe(1);
        expect(clampSuggestLimit(-3)).toBe(1);
    });

    it('answers nothing for a prefix under two characters and rejects an oversized one', () => {
        expect(normalizeSuggestPrefix(CONFIG, ' a ')).toBeNull();
        expect(normalizeSuggestPrefix(CONFIG, ' ab ')).toBe('ab');
        expect(() => normalizeSuggestPrefix(CONFIG, 'x'.repeat(11))).toThrow('Invalid suggestion');
    });

    it('offers suggestions only for whitelisted fields', () => {
        expect(suggestSpecFor(CONFIG, 'name')).toBe(SPEC);
        expect(() => suggestSpecFor(CONFIG, 'code')).toThrow('No suggestions');
        expect(() => suggestSpecFor(CONFIG, 'toString')).toThrow('No suggestions');
        expect(() => suggestSpecFor(CONFIG, 'nope')).toThrow('No suggestions');
    });

    it('binds the escaped prefix, keeps the fixed condition and orders by the indexed expression', () => {
        const { qb, calls } = fakeQb();
        applySuggest(qb, SPEC, "50%_\\'; DROP TABLE x;--", 10);
        const [sql, params] = calls.where[0]!;
        expect(sql).not.toContain('DROP');
        expect(params).toEqual({ suggestPrefix: "50\\%\\_\\\\'; DROP TABLE x;--" });
        expect(calls.where[1]![0]).toBe('"c"."active" IS TRUE');
        expect(calls.order).toEqual(['lower("c"."name") COLLATE "C"']);
        expect(calls.limit).toEqual([10]);
    });

    it('fetches twice the rows only for values that repeat', () => {
        const { qb, calls } = fakeQb();
        applySuggest(qb, { ...SPEC, repeats: true }, 'ab', 10);
        expect(calls.limit).toEqual([20]);
    });

    it('drops repeated and null values and stops at the limit', () => {
        const rows = ['a', 'a', null, 'b', 'c', 'd'].map(value => ({ value }));
        expect(dedupeSuggestions(rows, 3)).toEqual(['a', 'b', 'c']);
    });
});
