import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import {
    DEFAULT_SETTLEMENTS_SORT,
    type SettlementsSort,
    type SettlementsSortField,
} from '../../api/settlementsList';

type SortState = { field: string; order: 1 | -1 }[];

export function sortToState(sort: SettlementsSort, columns: AdvancedDataTableColumn[]): SortState {
    const column = columns.find(c => c.sortField === sort.field);
    return column ? [{ field: column.field, order: sort.dir === 'ASC' ? 1 : -1 }] : [];
}

export function sortFromState(
    state: SortState,
    columns: AdvancedDataTableColumn[],
): SettlementsSort {
    const first = state[0];
    const column = first && columns.find(c => c.field === first.field);
    if (!first || !column?.sortField) return { ...DEFAULT_SETTLEMENTS_SORT };
    return {
        field: column.sortField as SettlementsSortField,
        dir: first.order === 1 ? 'ASC' : 'DESC',
    };
}
