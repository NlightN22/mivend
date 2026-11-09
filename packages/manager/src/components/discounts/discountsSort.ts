import {
    DEFAULT_DISCOUNTS_SORT,
    type DiscountsSort,
    type DiscountsSortField,
} from '../../api/discountsList';
import type { AdvancedDataTableColumn } from '@mivend/ui-kit';

type SortState = { field: string; order: 1 | -1 }[];

export function sortToState(sort: DiscountsSort, columns: AdvancedDataTableColumn[]): SortState {
    const column = columns.find(c => c.sortField === sort.field);
    return column ? [{ field: column.field, order: sort.dir === 'ASC' ? 1 : -1 }] : [];
}

export function sortFromState(state: SortState, columns: AdvancedDataTableColumn[]): DiscountsSort {
    const first = state[0];
    const column = first && columns.find(c => c.field === first.field);
    if (!first || !column?.sortField) return { ...DEFAULT_DISCOUNTS_SORT };
    return {
        field: column.sortField as DiscountsSortField,
        dir: first.order === 1 ? 'ASC' : 'DESC',
    };
}
