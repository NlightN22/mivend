import type { SelectQueryBuilder } from 'typeorm';
import {
    applyListFilter,
    normalizeSuggestPrefix,
    suggestSpecFor,
    type FieldSpec,
    type ListFilter,
    type ListQueryConfig,
    type SuggestSpec,
} from 'shared';

import { INN_DIGITS_SQL } from './counterparty-inn-guard';
import {
    LAST_ORDER_AT_SQL,
    ensureLastOrderJoin,
    filterUsesLastOrder,
} from './counterparty-last-order.sql';
import { READINESS_CASE_SQL } from './counterparty-readiness-filter';
import type { Counterparty } from './entities/counterparty.entity';

export type CounterpartyFilterParameter = ListFilter;

const TEXT_OPERATORS = ['eq', 'notEq', 'contains', 'notContains', 'in', 'notIn'] as const;

const NUMBER_OPERATORS = ['eq', 'gt', 'gte', 'lt', 'lte', 'between'] as const;

// Blank counts as missing and text compares without case, as the list always did.
const text = (column: string): FieldSpec => ({
    kind: 'string',
    sql: `lower(NULLIF(${column}, ''))`,
    normalize: v => v.toLowerCase(),
    operators: TEXT_OPERATORS,
});

const MANAGER_NAME_SQL = `lower((SELECT eu."fullName" FROM erp_user eu
    WHERE eu."erpId" = c."managerErpId" LIMIT 1))`;

// Same rule as getInnStatus: no digits is missing; an active holder shared with another active one is a duplicate.
const INN_STATUS_SQL = `CASE WHEN ${INN_DIGITS_SQL} = '' THEN 'missing'
    WHEN c."isActive" AND EXISTS (SELECT 1 FROM counterparty d WHERE d.id <> c.id
        AND d."isActive" AND regexp_replace(coalesce(d.inn, ''), '\\D', '', 'g') = ${INN_DIGITS_SQL})
    THEN 'duplicate' ELSE 'ok' END`;

// The only fields a client may filter by; the key is the GraphQL field name.
const FIELDS: Record<string, FieldSpec> = {
    shortName: { ...text('c."shortName"'), suggest: { valueSql: 'c."shortName"' } },
    inn: { ...text('c.inn'), suggest: { valueSql: 'c.inn' } },
    phone: text('c.phone'),
    officialEmail: text('c."officialEmail"'),
    managerErpId: { ...text('c."managerErpId"'), containsAlsoSql: MANAGER_NAME_SQL },
    branchId: {
        kind: 'string',
        sql: `NULLIF(c."branchId", '')`,
        operators: ['eq', 'notEq', 'in', 'notIn'],
    },
    erpGroupLabel: text('c."erpGroupLabel"'),
    innStatus: {
        kind: 'string',
        sql: INN_STATUS_SQL,
        operators: ['eq', 'notEq', 'in', 'notIn'],
    },
    readiness: {
        kind: 'string',
        sql: READINESS_CASE_SQL,
        operators: ['eq', 'notEq', 'in', 'notIn'],
    },
    creditLimit: { kind: 'number', sql: 'c."creditLimit"', operators: NUMBER_OPERATORS },
    creditBalance: { kind: 'number', sql: 'c."creditBalance"', operators: NUMBER_OPERATORS },
    lastOrderAt: {
        kind: 'date',
        sql: LAST_ORDER_AT_SQL,
        operators: ['before', 'after', 'between'],
    },
    isActive: { kind: 'boolean', sql: 'c."isActive"', operators: ['eq'] },
};

const CONFIG: ListQueryConfig = {
    fields: FIELDS,
    sortable: [],
    paramPrefix: 'cf',
    defaultSql: 'c."shortName"',
    tiebreakerSql: 'c.id',
    allowOr: false,
    limits: { maxConditions: 20, maxValues: 100, maxTextLength: 200 },
};

// Narrows an already scoped query, never replaces the scope.
export function applyCounterpartyFilterParameter(
    qb: SelectQueryBuilder<Counterparty>,
    filter: CounterpartyFilterParameter | undefined,
): SelectQueryBuilder<Counterparty> {
    if (filterUsesLastOrder(filter)) ensureLastOrderJoin(qb);
    applyListFilter(CONFIG, qb, filter);
    return qb;
}

export function counterpartySuggestSpec(field: string): SuggestSpec {
    return suggestSpecFor(CONFIG, field);
}

export function counterpartySuggestPrefix(prefix: string): string | null {
    return normalizeSuggestPrefix(CONFIG, prefix);
}
