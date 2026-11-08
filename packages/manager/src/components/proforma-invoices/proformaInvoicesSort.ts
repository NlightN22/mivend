import {
    DEFAULT_PROFORMA_INVOICES_SORT,
    type ProformaInvoicesSort,
    type ProformaInvoicesSortField,
} from '../../api/proformaInvoicesList';
import type { AdvancedDataTableColumn } from '@mivend/ui-kit';

type SortState = { field: string; order: 1 | -1 }[];

export function sortToState(
    sort: ProformaInvoicesSort,
    columns: AdvancedDataTableColumn[],
): SortState {
    const column = columns.find(c => c.sortField === sort.field);
    return column ? [{ field: column.field, order: sort.dir === 'ASC' ? 1 : -1 }] : [];
}

export function sortFromState(
    state: SortState,
    columns: AdvancedDataTableColumn[],
): ProformaInvoicesSort {
    const first = state[0];
    const column = first && columns.find(c => c.field === first.field);
    if (!first || !column?.sortField) return { ...DEFAULT_PROFORMA_INVOICES_SORT };
    return {
        field: column.sortField as ProformaInvoicesSortField,
        dir: first.order === 1 ? 'ASC' : 'DESC',
    };
}
