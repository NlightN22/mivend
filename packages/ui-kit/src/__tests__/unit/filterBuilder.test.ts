import { describe, expect, it } from 'vitest';
import {
    OPERATORS_BY_TYPE,
    conditionsFromQuery,
    conditionsToQuery,
    describeCondition,
    isValueComplete,
    operatorsFor,
    sanitizeConditions,
    toVendureFilter,
    type FilterColumn,
    type FilterCondition,
} from '../../components/MvFilterBuilder/filterLogic';

const COLUMNS: FilterColumn[] = [
    { key: 'code', label: 'Order #', type: 'string' },
    { key: 'total', label: 'Total', type: 'number', serverField: 'totalWithTax', scale: 100 },
    { key: 'date', label: 'Date', type: 'date', serverField: 'createdAt' },
    { key: 'paid', label: 'Paid', type: 'boolean' },
    {
        key: 'state',
        label: 'Status',
        type: 'select',
        options: [
            { value: 'A', label: 'Alpha' },
            { value: 'B', label: 'Beta' },
        ],
    },
    { key: 'ref', label: 'Ref', type: 'id' },
    { key: 'owner', label: 'Owner', type: 'select', operators: ['eq'] },
];
const c = (
    columnKey: string,
    operator: FilterCondition['operator'],
    value: FilterCondition['value'] = '',
): FilterCondition => ({
    columnKey,
    operator,
    value,
});
const filterOf = (...conditions: FilterCondition[]): Record<string, unknown> =>
    toVendureFilter(conditions, COLUMNS);

describe('operator tables', () => {
    it.each([
        [
            'string',
            [
                'contains',
                'notContains',
                'eq',
                'notEq',
                'startsWith',
                'endsWith',
                'isNull',
                'notNull',
            ],
        ],
        ['number', ['eq', 'gt', 'gte', 'lt', 'lte', 'between', 'isNull']],
        ['date', ['before', 'after', 'between', 'isNull']],
        ['boolean', ['isTrue', 'isFalse']],
        ['select', ['eq', 'notEq', 'in', 'notIn']],
        ['id', ['eq', 'notEq', 'isNull', 'notNull']],
    ] as const)('%s offers exactly its operators', (type, operators) => {
        expect(OPERATORS_BY_TYPE[type]).toEqual(operators);
    });

    it('lets a column narrow the operators of its type', () => {
        expect(operatorsFor(COLUMNS[6]!)).toEqual(['eq']);
    });

    it('needs the right value shape per operator', () => {
        expect(isValueComplete('contains', ' ')).toBe(false);
        expect(isValueComplete('isNull', '')).toBe(true);
        expect(isValueComplete('between', ['1', ''])).toBe(false);
        expect(isValueComplete('between', ['1', '2'])).toBe(true);
        expect(isValueComplete('in', [])).toBe(false);
    });
});

describe('conditions to the Vendure filter', () => {
    it('maps string operators, using escaped regex for starts and ends with', () => {
        expect(filterOf(c('code', 'contains', 'a'))).toEqual({ code: { contains: 'a' } });
        expect(filterOf(c('code', 'notContains', 'a'))).toEqual({ code: { notContains: 'a' } });
        expect(filterOf(c('code', 'eq', 'a'))).toEqual({ code: { eq: 'a' } });
        expect(filterOf(c('code', 'notEq', 'a'))).toEqual({ code: { notEq: 'a' } });
        expect(filterOf(c('code', 'startsWith', 'a.b'))).toEqual({ code: { regex: '^a\\.b' } });
        expect(filterOf(c('code', 'endsWith', '1+'))).toEqual({ code: { regex: '1\\+$' } });
        expect(filterOf(c('code', 'isNull'))).toEqual({ code: { isNull: true } });
        expect(filterOf(c('code', 'notNull'))).toEqual({ code: { isNull: false } });
    });

    it('maps number operators, scaling to the stored unit and using the server field', () => {
        expect(filterOf(c('total', 'gte', '12.34'))).toEqual({ totalWithTax: { gte: 1234 } });
        expect(filterOf(c('total', 'between', ['1', '2']))).toEqual({
            totalWithTax: { between: { start: 100, end: 200 } },
        });
        expect(filterOf(c('total', 'isNull'))).toEqual({ totalWithTax: { isNull: true } });
    });

    it('maps date operators on whole local days', () => {
        const day = (iso: string, plus = 0): string =>
            new Date(new Date(`${iso}T00:00:00`).getTime() + plus * 86_400_000).toISOString();
        expect(filterOf(c('date', 'before', '2026-03-05'))).toEqual({
            createdAt: { before: day('2026-03-05') },
        });
        expect(filterOf(c('date', 'after', '2026-03-05'))).toEqual({
            createdAt: { after: day('2026-03-05', 1) },
        });
        expect(filterOf(c('date', 'between', ['2026-03-01', '2026-03-05']))).toEqual({
            createdAt: { between: { start: day('2026-03-01'), end: day('2026-03-05', 1) } },
        });
        expect(filterOf(c('date', 'isNull'))).toEqual({ createdAt: { isNull: true } });
    });

    it('maps boolean, select and id operators', () => {
        expect(filterOf(c('paid', 'isTrue'))).toEqual({ paid: { eq: true } });
        expect(filterOf(c('paid', 'isFalse'))).toEqual({ paid: { eq: false } });
        expect(filterOf(c('state', 'in', ['A', 'B']))).toEqual({ state: { in: ['A', 'B'] } });
        expect(filterOf(c('state', 'notIn', ['A']))).toEqual({ state: { notIn: ['A'] } });
        expect(filterOf(c('state', 'eq', 'A'))).toEqual({ state: { eq: 'A' } });
        expect(filterOf(c('ref', 'notNull'))).toEqual({ ref: { isNull: false } });
    });

    it('puts a second condition on the same field into _and', () => {
        expect(
            filterOf(c('total', 'gt', '10'), c('total', 'lt', '20'), c('code', 'eq', 'x')),
        ).toEqual({
            totalWithTax: { gt: 1000 },
            code: { eq: 'x' },
            _and: [{ totalWithTax: { lt: 2000 } }],
        });
    });

    it('skips incomplete values, unknown columns and operators the column does not offer', () => {
        expect(
            filterOf(c('code', 'contains', ''), c('nope', 'eq', 'x'), c('owner', 'in', ['A'])),
        ).toEqual({});
    });
});

describe('URL round trip', () => {
    it('round-trips every operator kind including awkward text', () => {
        const conditions = [
            c('code', 'contains', 'a b;c:d,e%f'),
            c('total', 'between', ['1', '2.5']),
            c('state', 'in', ['A', 'B']),
            c('code', 'isNull'),
            c('date', 'after', '2026-03-05'),
        ];
        expect(conditionsFromQuery(conditionsToQuery(conditions), COLUMNS)).toEqual(conditions);
    });

    it('reads an empty string as no conditions and drops garbage parts', () => {
        expect(conditionsFromQuery('', COLUMNS)).toEqual([]);
        expect(
            conditionsFromQuery('%E0%A4%A:eq:x;code:eq:ok;code:bogus:1;total:between:1', COLUMNS),
        ).toEqual([c('code', 'eq', 'ok')]);
    });

    it('sanitizes stored state of the wrong shape', () => {
        expect(sanitizeConditions('x', COLUMNS)).toEqual([]);
        expect(
            sanitizeConditions(
                [c('state', 'in', 'A'), { columnKey: 'code' }, c('paid', 'isTrue', 'junk')],
                COLUMNS,
            ),
        ).toEqual([c('paid', 'isTrue')]);
    });
});

describe('chip text', () => {
    it('reads like the filter it stands for', () => {
        expect(describeCondition(c('total', 'gt', '1000'), COLUMNS[1]!)).toBe('Total > 1000');
        expect(describeCondition(c('total', 'between', ['1', '2']), COLUMNS[1]!)).toBe(
            'Total 1 – 2',
        );
        expect(describeCondition(c('state', 'in', ['A', 'B']), COLUMNS[4]!)).toBe(
            'Status is any of Alpha, Beta',
        );
        expect(describeCondition(c('date', 'before', '2026-03-05'), COLUMNS[2]!)).toBe(
            'Date is before 05.03.2026',
        );
        expect(describeCondition(c('code', 'isNull'), COLUMNS[0]!)).toBe('Order # is empty');
    });
});
