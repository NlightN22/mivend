import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import type { FilterOption } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';
import { tr } from '../../utils/lazyLabels';

const NOT_FILTERED = { type: 'none' } as const;
const col = (field: string): string => tr(`changeJournal.history.columns.${field}`);

export interface HistoryColumnOptions {
    actions: FilterOption[];
    objects: FilterOption[];
    changedBy: FilterOption[];
}

export const NO_HISTORY_OPTIONS: HistoryColumnOptions = { actions: [], objects: [], changedBy: [] };
export const HISTORY_DEFAULT_SORT = { field: 'createdAt', dir: 'DESC' } as const;

// Identifying column first, creation date second; the server orders by date, newest first, so no column sorts.
export function buildHistoryColumns(options: HistoryColumnOptions): AdvancedDataTableColumn[] {
    return [
        {
            field: 'summary',
            header: col('summary'),
            width: 300,
            priority: 10,
            minWidth: 200,
            required: true,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            mobile: { primary: true },
        },
        {
            field: 'createdAt',
            header: col('createdAt'),
            width: 170,
            priority: 9,
            minWidth: 160,
            filterConfig: NOT_FILTERED,
            filterType: 'date',
            filterOperators: ['before', 'after', 'between'],
        },
        {
            field: 'action',
            header: col('action'),
            width: 140,
            priority: 8,
            minWidth: 120,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: options.actions,
            filterOperators: ['eq'],
            mobile: { badge: true },
        },
        {
            field: 'entityName',
            header: col('entityName'),
            width: 150,
            priority: 4,
            minWidth: 130,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: options.objects,
            filterOperators: ['eq'],
        },
        {
            field: 'changedBy',
            header: col('changedBy'),
            width: 180,
            priority: 5,
            minWidth: 140,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: options.changedBy,
            filterOperators: ['eq'],
        },
    ];
}
