import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import {
    DEFAULT_ERP_DOCUMENTS_SORT,
    type ErpDocumentsSort,
    type ErpDocumentsSortField,
} from '../../api/erpDocumentsList';

type SortState = { field: string; order: 1 | -1 }[];

export function sortToState(sort: ErpDocumentsSort, columns: AdvancedDataTableColumn[]): SortState {
    const column = columns.find(c => c.sortField === sort.field);
    return column ? [{ field: column.field, order: sort.dir === 'ASC' ? 1 : -1 }] : [];
}

export function sortFromState(
    state: SortState,
    columns: AdvancedDataTableColumn[],
): ErpDocumentsSort {
    const first = state[0];
    const column = first && columns.find(c => c.field === first.field);
    if (!first || !column?.sortField) return { ...DEFAULT_ERP_DOCUMENTS_SORT };
    return {
        field: column.sortField as ErpDocumentsSortField,
        dir: first.order === 1 ? 'ASC' : 'DESC',
    };
}
