import type { SelectQueryBuilder } from 'typeorm';
import { applyListFilter, type FieldSpec, type ListFilter, type ListQueryConfig } from 'shared';

import type { Counterparty } from './entities/counterparty.entity';

export type CounterpartyFilterParameter = ListFilter;

const TEXT_OPERATORS = ['eq', 'notEq', 'contains', 'notContains', 'in', 'notIn'] as const;

// Blank counts as missing and text compares without case, as the list always did.
const text = (column: string): FieldSpec => ({
    kind: 'string',
    sql: `lower(NULLIF(${column}, ''))`,
    normalize: v => v.toLowerCase(),
    operators: TEXT_OPERATORS,
});

const MANAGER_NAME_SQL = `lower((SELECT eu."fullName" FROM erp_user eu
    WHERE eu."erpId" = c."managerErpId" LIMIT 1))`;

// The only fields a client may filter by; the key is the GraphQL field name.
const FIELDS: Record<string, FieldSpec> = {
    shortName: text('c."shortName"'),
    inn: text('c.inn'),
    phone: text('c.phone'),
    officialEmail: text('c."officialEmail"'),
    managerErpId: { ...text('c."managerErpId"'), containsAlsoSql: MANAGER_NAME_SQL },
    branchId: {
        kind: 'string',
        sql: `NULLIF(c."branchId", '')`,
        operators: ['eq', 'notEq', 'in', 'notIn'],
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
    applyListFilter(CONFIG, qb, filter);
    return qb;
}
