import {
    conditionsFromQuery,
    conditionsToQuery,
    type FilterColumn,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import type { BulkBatchFilter } from './generated/graphql';

export interface BulkHistoryFilters {
    search: string;
    view: string;
    conditions: FilterCondition[];
}

export const BLANK_HISTORY_FILTERS: BulkHistoryFilters = {
    search: '',
    view: 'all',
    conditions: [],
};

export const HISTORY_VIEWS = [
    { key: 'all', label: 'All', status: '' },
    { key: 'running', label: 'In progress', status: 'running' },
    { key: 'done', label: 'Done', status: 'done' },
    { key: 'partial', label: 'Partly failed', status: 'partial' },
    { key: 'stopped', label: 'Stopped', status: 'stopped' },
    { key: 'failed', label: 'Failed', status: 'failed' },
] as const;

export const HISTORY_SORT_FIELDS = ['createdAt', 'number', 'operationType', 'status'];

export const HISTORY_FILTER_COLUMNS: FilterColumn[] = [
    { key: 'date', label: 'Date', type: 'date', operators: ['before', 'after', 'between'] },
    { key: 'operation', label: 'Operation', type: 'select', operators: ['eq'], options: [] },
    { key: 'result', label: 'Result', type: 'select', operators: ['eq'], serverField: 'status' },
];

function nextDay(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

// The history query takes a small fixed filter, not the generic Vendure one; each condition maps by hand.
export function toBatchFilter(filters: BulkHistoryFilters): BulkBatchFilter {
    const filter: BulkBatchFilter = {};
    const view = HISTORY_VIEWS.find(v => v.key === filters.view);
    if (view?.status) filter.status = view.status;
    const digits = filters.search.replace(/\D/g, '');
    if (digits) filter.numberPrefix = digits;
    for (const c of filters.conditions) {
        if (c.columnKey === 'result' && typeof c.value === 'string') filter.status = c.value;
        else if (c.columnKey === 'operation' && typeof c.value === 'string')
            filter.operationType = c.value;
        else if (c.columnKey === 'date') {
            if (c.operator === 'after' && typeof c.value === 'string')
                filter.createdFrom = nextDay(c.value);
            else if (c.operator === 'before' && typeof c.value === 'string')
                filter.createdTo = c.value;
            else if (c.operator === 'between' && Array.isArray(c.value)) {
                filter.createdFrom = c.value[0];
                filter.createdTo = nextDay(c.value[1]);
            }
        }
    }
    return filter;
}

export function conditionsToUrl(conditions: FilterCondition[]): string {
    return conditionsToQuery(conditions);
}

export function conditionsFromUrl(value: string): FilterCondition[] {
    return conditionsFromQuery(value, HISTORY_FILTER_COLUMNS);
}
