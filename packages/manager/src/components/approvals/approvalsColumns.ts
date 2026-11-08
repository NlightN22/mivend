import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { REQUEST_TYPE_LABEL } from '../../api/approvals';

const NOT_FILTERED = { type: 'none' } as const;

export const APPROVAL_STATUS_LABEL: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
};

// Widths sum to 1080, which fits the 1088px table of a 1360px page.
export const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'id',
        header: 'Request #',
        sortField: 'id',
        width: 100,
        minWidth: 100,
        priority: 10,
        required: true,
        filterConfig: NOT_FILTERED,
        mobile: { primary: true },
    },
    {
        field: 'type',
        header: 'Type',
        sortField: 'requestType',
        width: 170,
        minWidth: 150,
        priority: 9,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOptions: Object.entries(REQUEST_TYPE_LABEL).map(([value, label]) => ({
            value,
            label,
        })),
        filterOperators: ['eq', 'in'],
    },
    {
        field: 'subject',
        header: 'Subject',
        width: 200,
        minWidth: 150,
        priority: 8,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'requested',
        header: 'Requested',
        width: 130,
        minWidth: 110,
        priority: 5,
        filterConfig: NOT_FILTERED,
        mobile: { hidden: true },
    },
    {
        field: 'requestedBy',
        header: 'Requested by',
        width: 120,
        minWidth: 100,
        priority: 6,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOptions: [],
        filterOperators: ['eq'],
    },
    {
        field: 'step',
        header: 'Current step',
        width: 150,
        minWidth: 130,
        priority: 3,
        filterConfig: NOT_FILTERED,
        mobile: { hidden: true },
    },
    {
        field: 'createdAt',
        header: 'Submitted',
        sortField: 'createdAt',
        width: 120,
        minWidth: 120,
        priority: 7,
        filterConfig: NOT_FILTERED,
        filterType: 'date',
    },
    {
        field: 'status',
        header: 'Status',
        sortField: 'status',
        width: 110,
        minWidth: 110,
        priority: 4,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOptions: Object.entries(APPROVAL_STATUS_LABEL).map(([value, label]) => ({
            value,
            label,
        })),
        filterOperators: ['eq', 'in'],
        mobile: { badge: true },
    },
];

export const DEFAULT_HIDDEN_COLUMNS: string[] = [];
