import type { ApprovalSortField, ApprovalsSort } from '../../api/approvals-list';

interface SortColumn {
    field: string;
    sortField?: string;
}

export interface ApprovalsTableFilters {
    [key: string]: unknown;
    id: string;
}

export const BLANK_TABLE_FILTERS: ApprovalsTableFilters = { id: '' };

export function sortToState(
    sort: ApprovalsSort,
    columns: SortColumn[],
): { field: string; order: 1 | -1 }[] {
    const column = columns.find(c => c.sortField === sort.field);
    return column ? [{ field: column.field, order: sort.dir === 'ASC' ? 1 : -1 }] : [];
}

export function sortFromState(
    state: { field: string; order: 1 | -1 }[],
    columns: SortColumn[],
): ApprovalsSort {
    const first = state[0];
    const column = first && columns.find(c => c.field === first.field);
    if (!first || !column?.sortField) return { field: 'createdAt', dir: 'DESC' };
    return {
        field: column.sortField as ApprovalSortField,
        dir: first.order === 1 ? 'ASC' : 'DESC',
    };
}
