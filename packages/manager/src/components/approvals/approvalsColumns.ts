import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { REQUEST_TYPE_LABEL } from '../../api/approvals';

const NOT_FILTERED = { type: 'none' } as const;

export const APPROVAL_STATUS_LABEL: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
};

// Visible widths sum to 1060 and fit the 1088px table of a 1360px page; Current step opens hidden.
export const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'id',
        header: 'Request #',
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
        header: 'Type',
        sortField: 'requestType',
        width: 190,
        minWidth: 170,
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
        width: 220,
        minWidth: 160,
        priority: 8,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'requested',
        header: 'Requested',
        width: 120,
        minWidth: 110,
        priority: 5,
        filterConfig: NOT_FILTERED,
        mobile: { hidden: true },
    },
    {
        field: 'requestedBy',
        header: 'Requested by',
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
        width: 120,
        minWidth: 120,
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

export const DEFAULT_HIDDEN_COLUMNS: string[] = ['step'];
