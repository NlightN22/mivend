import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import {
    DEFAULT_POWERS_OF_ATTORNEY_SORT,
    type PowersOfAttorneySort,
    type PowersOfAttorneySortField,
} from '../../api/powersOfAttorneyList';

type SortState = { field: string; order: 1 | -1 }[];

export function sortToState(
    sort: PowersOfAttorneySort,
    columns: AdvancedDataTableColumn[],
): SortState {
    const column = columns.find(c => c.sortField === sort.field);
    return column ? [{ field: column.field, order: sort.dir === 'ASC' ? 1 : -1 }] : [];
}

export function sortFromState(
    state: SortState,
    columns: AdvancedDataTableColumn[],
): PowersOfAttorneySort {
    const first = state[0];
    const column = first && columns.find(c => c.field === first.field);
    if (!first || !column?.sortField) return { ...DEFAULT_POWERS_OF_ATTORNEY_SORT };
    return {
        field: column.sortField as PowersOfAttorneySortField,
        dir: first.order === 1 ? 'ASC' : 'DESC',
    };
}
