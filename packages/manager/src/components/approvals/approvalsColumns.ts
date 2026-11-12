import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { REQUEST_TYPE_LABEL } from '../../api/approvals';
import { lazyLabels, tr } from '../../utils/lazyLabels';

const NOT_FILTERED = { type: 'none' } as const;

export const APPROVAL_STATUS_LABEL = lazyLabels('approvals.status', [
    'pending',
    'approved',
    'rejected',
]);

// Headers and option labels resolve on read, so the table follows a language switch.
// Visible widths sum to 1060 and fit the 1088px table of a 1360px page; Current step opens hidden.
const COLUMNS: Omit<AdvancedDataTableColumn, 'header'>[] = [
    {
        field: 'id',
        sortField: 'id',
        width: 130,
        minWidth: 130,
        priority: 10,
        required: true,
        filterConfig: NOT_FILTERED,
        mobile: { primary: true },
    },
    {
        field: 'type',
        sortField: 'requestType',
        width: 190,
        minWidth: 170,
        priority: 9,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOperators: ['eq', 'in'],
    },
    {
        field: 'subject',
        width: 220,
        minWidth: 160,
        priority: 8,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'requested',
        width: 120,
        minWidth: 110,
        priority: 5,
        filterConfig: NOT_FILTERED,
        mobile: { hidden: true },
    },
    {
        field: 'requestedBy',
        width: 150,
        minWidth: 120,
        priority: 6,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOptions: [],
        filterOperators: ['eq'],
    },
    {
        field: 'step',
        width: 150,
        minWidth: 130,
        priority: 3,
        filterConfig: NOT_FILTERED,
        mobile: { hidden: true },
    },
    {
        field: 'createdAt',
        sortField: 'createdAt',
        width: 120,
        minWidth: 120,
        priority: 7,
        filterConfig: NOT_FILTERED,
        filterType: 'date',
    },
    {
        field: 'status',
        sortField: 'status',
        width: 120,
        minWidth: 120,
        priority: 4,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOperators: ['eq', 'in'],
        mobile: { badge: true },
    },
];

const LAZY_OPTIONS: Record<string, () => { value: string; label: string }[]> = {
    type: () => Object.entries(REQUEST_TYPE_LABEL).map(([value, label]) => ({ value, label })),
    status: () => Object.entries(APPROVAL_STATUS_LABEL).map(([value, label]) => ({ value, label })),
};

export const ALL_COLUMNS: AdvancedDataTableColumn[] = COLUMNS.map(column => {
    const lazy = Object.defineProperty({ ...column }, 'header', {
        enumerable: true,
        get: () => tr(`approvals.columns.${column.field}`),
    }) as AdvancedDataTableColumn;
    const options = LAZY_OPTIONS[column.field];
    if (options) Object.defineProperty(lazy, 'filterOptions', { enumerable: true, get: options });
    return lazy;
});

export const DEFAULT_HIDDEN_COLUMNS: string[] = ['step'];
