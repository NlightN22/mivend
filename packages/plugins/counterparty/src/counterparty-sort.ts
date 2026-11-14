import type { SelectQueryBuilder } from 'typeorm';

import { LAST_ORDER_AT_SQL, ensureLastOrderJoin } from './counterparty-last-order.sql';
import { Counterparty } from './entities/counterparty.entity';
import { CounterpartySortParameter } from './types';

// Column name must come from a whitelist of CounterpartySortParameter fields, never caller input
// Today only GraphQL-validated enum keys arrive, but the whitelist must hold regardless
const SORTABLE_COLUMNS: Record<Exclude<keyof CounterpartySortParameter, 'lastOrderAt'>, string> = {
    shortName: 'c.shortName',
    inn: 'c.inn',
    managerErpId: 'c.managerErpId',
    phone: 'c.phone',
    officialEmail: 'c.officialEmail',
    creditLimit: 'c.creditLimit',
    creditBalance: 'c.creditBalance',
};

// Only the first non-null sort key applies: one active sort, matching MvAdvancedDataTable
// A selected alias, not a raw expression: take/skip paging resolves order keys through the selection.
const LAST_ORDER_ALIAS = 'last_order_sort';

export function applyCounterpartySort(
    qb: SelectQueryBuilder<Counterparty>,
    sort?: CounterpartySortParameter,
): void {
    if (!sort) return;
    for (const [field, order] of Object.entries(sort) as Array<
        [keyof CounterpartySortParameter, 'ASC' | 'DESC' | null | undefined]
    >) {
        if (!order) continue;
        if (field === 'lastOrderAt') {
            ensureLastOrderJoin(qb);
            qb.addSelect(LAST_ORDER_AT_SQL, LAST_ORDER_ALIAS).orderBy(
                LAST_ORDER_ALIAS,
                order,
                'NULLS LAST',
            );
        } else {
            qb.orderBy(SORTABLE_COLUMNS[field], order);
        }
        return;
    }
}
