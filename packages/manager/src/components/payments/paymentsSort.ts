import {
    DEFAULT_PAYMENTS_SORT,
    type PaymentsSort,
    type PaymentsSortField,
} from '../../api/paymentsList';
import type { AdvancedDataTableColumn } from '@mivend/ui-kit';

type SortState = { field: string; order: 1 | -1 }[];

export function sortToState(sort: PaymentsSort, columns: AdvancedDataTableColumn[]): SortState {
    const column = columns.find(c => c.sortField === sort.field);
    return column ? [{ field: column.field, order: sort.dir === 'ASC' ? 1 : -1 }] : [];
}

export function sortFromState(state: SortState, columns: AdvancedDataTableColumn[]): PaymentsSort {
    const first = state[0];
    const column = first && columns.find(c => c.field === first.field);
    if (!first || !column?.sortField) return { ...DEFAULT_PAYMENTS_SORT };
    return {
        field: column.sortField as PaymentsSortField,
        dir: first.order === 1 ? 'ASC' : 'DESC',
    };
}
