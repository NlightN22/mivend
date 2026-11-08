import {
    conditionsFromQuery,
    conditionsToQuery,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import {
    APPROVALS_FILTER_COLUMNS,
    APPROVALS_VIEWS,
    type ApprovalSortField,
    type ApprovalsListFilters,
    type ApprovalsSort,
    type ApprovalsView,
} from '../api/approvals-list';

export interface ApprovalsListUrlState {
    [key: string]: string;
    search: string;
    view: string;
    filters: string;
    sortField: string;
    sortDir: string;
    pageSize: string;
}

export const APPROVALS_URL_DEFAULTS: ApprovalsListUrlState = {
    search: '',
    view: 'awaiting',
    filters: '',
    sortField: 'createdAt',
    sortDir: 'DESC',
    pageSize: '10',
};

const SORT_FIELDS: ApprovalSortField[] = ['id', 'requestType', 'status', 'createdAt'];

export function toUrlState(
    filters: ApprovalsListFilters,
    sort: ApprovalsSort,
    pageSize: number,
): ApprovalsListUrlState {
    return {
        search: filters.search,
        view: filters.view,
        filters: conditionsToQuery(filters.conditions),
        sortField: sort.field,
        sortDir: sort.dir,
        pageSize: String(pageSize),
    };
}

export function fromUrlState(url: ApprovalsListUrlState): {
    filters: ApprovalsListFilters;
    sort: ApprovalsSort;
    pageSize: number;
} {
    const view = APPROVALS_VIEWS.some(v => v.key === url.view)
        ? (url.view as ApprovalsView)
        : 'awaiting';
    const pageSize = Number(url.pageSize);
    return {
        filters: {
            search: url.search,
            view,
            conditions: conditionsFromQuery(url.filters, APPROVALS_FILTER_COLUMNS),
        },
        sort: {
            field: SORT_FIELDS.find(f => f === url.sortField) ?? 'createdAt',
            dir: url.sortDir === 'ASC' ? 'ASC' : 'DESC',
        },
        pageSize: pageSize > 0 ? pageSize : 10,
    };
}
