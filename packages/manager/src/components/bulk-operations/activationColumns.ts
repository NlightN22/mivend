import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { i18n } from '../../i18n';
import type { BranchOption } from '../../api/orders';

export const UNASSIGNED_BRANCH = 'unassigned';

const NOT_FILTERED = { type: 'none' } as const;
const TEXT_OPERATORS = ['contains', 'notContains', 'eq', 'notEq'] as const;
const TEXT_OR_EMPTY = [...TEXT_OPERATORS, 'isNull', 'notNull'] as const;

// Widths sum to 990 plus the selection column and fit a 1360px page; filtering is the toolbar
// Filter builder. Readiness is the quick-filter chip row, not a builder column.
export function buildActivationColumns(
    branches: BranchOption[],
    managers: Array<{ value: string; label: string }> = [],
): AdvancedDataTableColumn[] {
    return [
        {
            field: 'shortName',
            header: i18n.global.t('bulkOperations.activation.columns.shortName'),
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
            header: i18n.global.t('bulkOperations.activation.columns.inn'),
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
            header: i18n.global.t('bulkOperations.activation.columns.manager'),
            width: 140,
            minWidth: 110,
            priority: 6,
            sortField: 'managerErpId',
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterField: 'managerErpId',
            filterOperators: ['eq', 'notEq'],
            filterOptions: managers,
        },
        {
            field: 'branch',
            header: i18n.global.t('bulkOperations.activation.columns.branch'),
            width: 130,
            minWidth: 100,
            priority: 4,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterField: 'branchId',
            filterOperators: ['eq', 'notEq'],
            filterOptions: [
                {
                    value: UNASSIGNED_BRANCH,
                    label: i18n.global.t('bulkOperations.activation.unassigned'),
                },
                ...branches.map(b => ({ value: b.id, label: b.name })),
            ],
        },
        {
            field: 'officialEmail',
            header: i18n.global.t('bulkOperations.activation.columns.officialEmail'),
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
            header: i18n.global.t('bulkOperations.activation.columns.readiness'),
            width: 210,
            minWidth: 210,
            priority: 9,
            filterConfig: NOT_FILTERED,
            mobile: { badge: true },
        },
        {
            field: 'phone',
            header: i18n.global.t('bulkOperations.activation.columns.phone'),
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
            header: i18n.global.t('bulkOperations.activation.columns.isActive'),
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
