import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import type { CounterpartySortParameter } from '../../api/counterpartyPortalAccess';

export type ActivationSortField = keyof CounterpartySortParameter;

export interface ActivationSort {
    field: ActivationSortField;
    dir: 'ASC' | 'DESC';
}

export const ACTIVATION_SORT_FIELDS: ActivationSortField[] = [
    'shortName',
    'inn',
    'managerErpId',
    'phone',
    'officialEmail',
    'creditLimit',
    'creditBalance',
];

export const DEFAULT_ACTIVATION_SORT: ActivationSort = { field: 'shortName', dir: 'ASC' };

// Column key differs from the server sort key (manager -> managerErpId); an unknown sort key fails the whole query.
export function sortToState(
    sort: ActivationSort,
    columns: AdvancedDataTableColumn[],
): { field: string; order: 1 | -1 }[] {
    const column = columns.find(c => c.sortField === sort.field);
    return column ? [{ field: column.field, order: sort.dir === 'ASC' ? 1 : -1 }] : [];
}

export function sortFromState(
    state: { field: string; order: 1 | -1 }[],
    columns: AdvancedDataTableColumn[],
): ActivationSort {
    const first = state[0];
    const sortField = first && columns.find(c => c.field === first.field)?.sortField;
    const field = ACTIVATION_SORT_FIELDS.find(f => f === sortField);
    if (!first || !field) return { ...DEFAULT_ACTIVATION_SORT };
    return { field, dir: first.order === 1 ? 'ASC' : 'DESC' };
}

export function sortParameter(sort: ActivationSort): CounterpartySortParameter {
    return { [sort.field]: sort.dir };
}
