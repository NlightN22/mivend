import { describe, expect, it } from 'vitest';

import {
    InvalidListOptionsError,
    LIST_MAX_TAKE,
    escapeLike,
    parseFilter,
    parsePaging,
    parseSort,
} from '../../list-options';

const FIELDS = { stream: 'e.stream', lastError: 'e.last_error' };

describe('parseFilter', () => {
    it('returns null without a filter', () => {
        expect(parseFilter({}, FIELDS)).toBeNull();
    });

    it('maps eq/contains/in/isNull onto whitelisted columns', () => {
        const node = parseFilter(
            { filter: { stream: { eq: 'bank' }, lastError: { contains: 'x', isNull: false } } },
            FIELDS,
        );
        expect(node).toEqual({
            kind: 'group',
            operator: 'AND',
            children: [
                { kind: 'cond', column: 'e.stream', op: 'eq', value: 'bank' },
                { kind: 'cond', column: 'e.last_error', op: 'like', value: 'x' },
                { kind: 'cond', column: 'e.last_error', op: 'isnull', value: false },
            ],
        });
    });

    it('honours filterOperator OR and nested _and groups (the dashboard sends _and)', () => {
        const node = parseFilter(
            {
                filterOperator: 'OR',
                filter: { _and: [{ stream: { eq: 'a' } }], lastError: { contains: 'b' } },
            },
            FIELDS,
        );
        expect(node).toMatchObject({ kind: 'group', operator: 'OR' });
        expect(node && node.kind === 'group' && node.children[0]).toMatchObject({
            kind: 'group',
            operator: 'AND',
        });
    });

    it('rejects unknown fields and operators instead of building SQL from them', () => {
        expect(() => parseFilter({ filter: { payload: { eq: 'x' } } }, FIELDS)).toThrow(
            InvalidListOptionsError,
        );
        expect(() => parseFilter({ filter: { stream: { regex: 'x' } } }, FIELDS)).toThrow(
            InvalidListOptionsError,
        );
        expect(() => parseFilter({ filter: { stream: { eq: 5 } } }, FIELDS)).toThrow(
            InvalidListOptionsError,
        );
    });
});

describe('parseSort', () => {
    it('falls back when no sort is given and rejects unknown columns', () => {
        const fallback = { column: 'e.id', direction: 'DESC' as const };
        expect(parseSort({}, FIELDS, fallback)).toEqual([fallback]);
        expect(parseSort({ sort: { stream: 'DESC' } }, FIELDS, fallback)).toEqual([
            { column: 'e.stream', direction: 'DESC' },
        ]);
        expect(() => parseSort({ sort: { payload: 'ASC' } }, FIELDS, fallback)).toThrow(
            InvalidListOptionsError,
        );
    });
});

describe('parsePaging', () => {
    it('defaults, clamps take to the maximum and floors skip at zero', () => {
        expect(parsePaging({})).toEqual({ skip: 0, take: 20 });
        expect(parsePaging({ take: 100000, skip: -5 })).toEqual({ skip: 0, take: LIST_MAX_TAKE });
    });
});

describe('escapeLike', () => {
    it('escapes LIKE wildcards in user text', () => {
        expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    });
});
