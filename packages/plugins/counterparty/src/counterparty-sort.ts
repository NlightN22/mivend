import type { SelectQueryBuilder } from 'typeorm';

import { Counterparty } from './entities/counterparty.entity';
import { CounterpartySortParameter } from './types';

// Column name must come from a whitelist of CounterpartySortParameter fields, never caller input
// Today only GraphQL-validated enum keys arrive, but the whitelist must hold regardless
const SORTABLE_COLUMNS: Record<keyof CounterpartySortParameter, string> = {
    shortName: 'c.shortName',
    inn: 'c.inn',
    managerErpId: 'c.managerErpId',
    phone: 'c.phone',
    officialEmail: 'c.officialEmail',
};

// Only the first non-null sort key applies: one active sort, matching MvAdvancedDataTable
export function applyCounterpartySort(
    qb: SelectQueryBuilder<Counterparty>,
    sort?: CounterpartySortParameter,
): void {
    if (!sort) return;
    for (const [field, order] of Object.entries(sort) as Array<
        [keyof CounterpartySortParameter, 'ASC' | 'DESC' | null | undefined]
    >) {
        if (!order) continue;
        qb.orderBy(SORTABLE_COLUMNS[field], order);
        return;
    }
}
