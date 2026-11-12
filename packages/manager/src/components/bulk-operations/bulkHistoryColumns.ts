import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { i18n } from '../../i18n';
import { batchStatusOptions } from '../../api/bulkOperations';

const NOT_FILTERED = { type: 'none' } as const;

// Filtering is the toolbar Filter builder; the search box matches the batch number by prefix.
export function buildHistoryColumns(
    operations: Array<{ value: string; label: string }>,
): AdvancedDataTableColumn[] {
    return [
        {
            field: 'number',
            header: i18n.global.t('bulkOperations.history.columns.number'),
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
            header: i18n.global.t('bulkOperations.history.columns.date'),
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
            header: i18n.global.t('bulkOperations.history.columns.operation'),
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
            header: i18n.global.t('bulkOperations.history.columns.createdBy'),
            width: 160,
            minWidth: 120,
            priority: 6,
            filterConfig: NOT_FILTERED,
        },
        {
            field: 'records',
            header: i18n.global.t('bulkOperations.history.columns.records'),
            width: 130,
            minWidth: 110,
            priority: 7,
            filterConfig: NOT_FILTERED,
        },
        {
            field: 'result',
            header: i18n.global.t('bulkOperations.history.columns.result'),
            sortField: 'status',
            width: 220,
            minWidth: 180,
            priority: 5,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: batchStatusOptions(),
            filterField: 'status',
            filterOperators: ['eq'],
            mobile: { badge: true },
        },
    ];
}
