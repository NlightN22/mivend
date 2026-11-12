import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { DEFAULT_ERP_DISCOUNTS_SORT, type ErpDiscountsSort } from '../../api/erpDiscountsList';

type SortState = { field: string; order: 1 | -1 }[];

export function erpSortToState(
    sort: ErpDiscountsSort,
    columns: AdvancedDataTableColumn[],
): SortState {
    const column = columns.find(c => c.sortField === sort.field);
    return column ? [{ field: column.field, order: sort.dir === 'ASC' ? 1 : -1 }] : [];
}

export function erpSortFromState(
    state: SortState,
    columns: AdvancedDataTableColumn[],
): ErpDiscountsSort {
    const first = state[0];
    const column = first && columns.find(c => c.field === first.field);
    if (!first || !column?.sortField) return { ...DEFAULT_ERP_DISCOUNTS_SORT };
    return {
        field: column.sortField as ErpDiscountsSort['field'],
        dir: first.order === 1 ? 'ASC' : 'DESC',
    };
}
