import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import type { BranchOption } from '../../api/orders';

export const UNASSIGNED_BRANCH = 'unassigned';

const NOT_FILTERED = { type: 'none' } as const;
const TEXT_OPERATORS = ['contains', 'notContains', 'eq', 'notEq'] as const;
const TEXT_OR_EMPTY = [...TEXT_OPERATORS, 'isNull', 'notNull'] as const;

// Widths sum to 990 plus the selection column and fit a 1360px page; filtering is the toolbar
// Filter builder. Readiness is the quick-filter chip row, not a builder column.
export function buildActivationColumns(branches: BranchOption[]): AdvancedDataTableColumn[] {
    return [
        {
            field: 'shortName',
            header: 'Company name',
            width: 200,
            minWidth: 160,
            priority: 10,
            required: true,
            sortField: 'shortName',
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterOperators: [...TEXT_OPERATORS],
            mobile: { primary: true },
        },
        {
            field: 'inn',
            header: 'INN',
            width: 120,
            minWidth: 120,
            priority: 8,
            sortField: 'inn',
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterOperators: [...TEXT_OR_EMPTY],
        },
        // Sorts by the raw managerErpId though the cell shows a resolved name.
        {
            field: 'manager',
            header: 'Manager',
            width: 140,
            minWidth: 110,
            priority: 6,
            sortField: 'managerErpId',
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterField: 'managerErpId',
            filterOperators: ['contains', 'notContains', 'isNull', 'notNull'],
        },
        {
            field: 'branch',
            header: 'Branch',
            width: 130,
            minWidth: 100,
            priority: 4,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterField: 'branchId',
            filterOperators: ['eq', 'notEq'],
            filterOptions: [
                { value: UNASSIGNED_BRANCH, label: 'Unassigned' },
                ...branches.map(b => ({ value: b.id, label: b.name })),
            ],
        },
        {
            field: 'officialEmail',
            header: 'Official email',
            width: 190,
            minWidth: 150,
            priority: 7,
            sortField: 'officialEmail',
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterOperators: [...TEXT_OR_EMPTY],
        },
        {
            field: 'readiness',
            header: 'Portal access',
            width: 210,
            minWidth: 210,
            priority: 9,
            filterConfig: NOT_FILTERED,
            mobile: { badge: true },
        },
        {
            field: 'phone',
            header: 'Phone',
            width: 150,
            priority: 3,
            sortField: 'phone',
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterOperators: [...TEXT_OR_EMPTY],
            mobile: { hidden: true },
        },
        {
            field: 'isActive',
            header: 'Active in ERP',
            width: 130,
            priority: 2,
            filterConfig: NOT_FILTERED,
            filterType: 'boolean',
            mobile: { hidden: true },
        },
    ];
}

// Opens without these; the column settings bring them back.
export const DEFAULT_HIDDEN_COLUMNS = ['phone', 'isActive'];
