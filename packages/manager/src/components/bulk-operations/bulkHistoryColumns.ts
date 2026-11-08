import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { BATCH_STATUS_OPTIONS } from '../../api/bulkOperations';

const NOT_FILTERED = { type: 'none' } as const;

// Filtering is the toolbar Filter builder; the search box matches the batch number by prefix.
export function buildHistoryColumns(
    operations: Array<{ value: string; label: string }>,
): AdvancedDataTableColumn[] {
    return [
        {
            field: 'number',
            header: 'Batch #',
            sortField: 'number',
            width: 120,
            minWidth: 110,
            priority: 10,
            required: true,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            mobile: { primary: true },
        },
        {
            field: 'date',
            header: 'Date',
            sortField: 'createdAt',
            width: 150,
            minWidth: 140,
            priority: 8,
            filterConfig: NOT_FILTERED,
            filterType: 'date',
            filterOperators: ['before', 'after', 'between'],
        },
        {
            field: 'operation',
            header: 'Operation',
            sortField: 'operationType',
            width: 200,
            minWidth: 160,
            priority: 9,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: operations,
            filterOperators: ['eq'],
        },
        {
            field: 'createdBy',
            header: 'Run by',
            width: 160,
            minWidth: 120,
            priority: 6,
            filterConfig: NOT_FILTERED,
        },
        {
            field: 'records',
            header: 'Records',
            sortField: 'totalCount',
            width: 130,
            minWidth: 110,
            priority: 7,
            filterConfig: NOT_FILTERED,
        },
        {
            field: 'result',
            header: 'Result',
            sortField: 'status',
            width: 220,
            minWidth: 180,
            priority: 5,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: BATCH_STATUS_OPTIONS,
            filterField: 'status',
            filterOperators: ['eq'],
            mobile: { badge: true },
        },
    ];
}
