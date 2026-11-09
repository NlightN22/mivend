import { describe, it, expect } from 'vitest';
import {
    applyListFilter,
    clampSkip,
    clampTake,
    type ListFilter,
    type ListQueryConfig,
} from '../../list-filter-engine';

describe('clampTake', () => {
    it('defaults to 50, keeps 0 as count-only and bounds both ends', () => {
        expect(clampTake(undefined)).toBe(50);
        expect(clampTake(0)).toBe(0);
        expect(clampTake(-1)).toBe(0);
        expect(clampTake(25)).toBe(25);
        expect(clampTake(100000)).toBe(200);
    });
});

describe('clampSkip', () => {
    it('keeps a normal integer, floors negatives and undefined to 0', () => {
        expect(clampSkip(undefined)).toBe(0);
        expect(clampSkip(0)).toBe(0);
        expect(clampSkip(-10)).toBe(0);
        expect(clampSkip(20)).toBe(20);
        expect(clampSkip(2.7)).toBe(2);
    });
});

const config: ListQueryConfig = {
    fields: {
        name: {
            kind: 'string',
            sql: 'x.name',
            operators: ['eq', 'contains'],
            containsAlsoSql: 'x.alias',
        },
        active: { kind: 'boolean', sql: 'x.active' },
    },
    sortable: [],
    paramPrefix: 'p',
    defaultSql: 'x.id',
    tiebreakerSql: 'x.id',
    allowOr: false,
    limits: { maxConditions: 2, maxValues: 2, maxTextLength: 5 },
};

function run(filter: unknown): { sql: string; params: Record<string, unknown> } {
    let sql = '';
    let params: Record<string, unknown> = {};
    const qb = {
        andWhere: (s: string, p: Record<string, unknown>) => {
            sql = s;
            params = p;
        },
    };
    applyListFilter(config, qb as never, filter as ListFilter);
    return { sql, params };
}

describe('applyListFilter extensions', () => {
    it('matches contains against the extra SQL too, null-safe', () => {
        expect(run({ name: { contains: 'a_' } }).sql).toContain('x.alias ILIKE :p0');
        expect(run({ name: { contains: 'a' } }).params.p0).toBe('%a%');
    });

    it('restricts operators per field and handles booleans', () => {
        expect(() => run({ name: { notEq: 'a' } })).toThrow(/Unsupported/);
        expect(run({ active: { eq: false } }).params.p0).toBe(false);
        expect(() => run({ active: { eq: 'yes' } })).toThrow(/Unsupported/);
    });

    it('enforces optional limits and rejects _or when disallowed', () => {
        expect(() => run({ name: { eq: 'abcdef' } })).toThrow(/Invalid filter value/);
        expect(() => run({ name: { eq: 'a', contains: 'b' }, active: { eq: true } })).toThrow(
            /At most 2/,
        );
        expect(() => run({ _or: [{ active: { eq: true } }] })).toThrow(/_or/);
    });

    it('turns malformed shapes into user input errors', () => {
        for (const bad of [{ _and: {} }, { _and: [null] }, { name: 'x' }]) {
            expect(() => run(bad)).toThrow(/Invalid/);
        }
    });
});
