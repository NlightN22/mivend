import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import type { FilterOption } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';
import { tr } from '../../utils/lazyLabels';

const NOT_FILTERED = { type: 'none' } as const;
const col = (field: string): string => tr(`customers.portalUsers.columns.${field}`);

export interface PortalUserColumnOptions {
    roles: FilterOption[];
    statuses: FilterOption[];
}

export const PORTAL_USER_SORT_FIELDS = ['name', 'createdAt', 'portalRole'];
export const PORTAL_USER_DEFAULT_SORT = { field: 'createdAt', dir: 'DESC' } as const;

// Identifying column first, creation date second.
export function buildPortalUserColumns(options: PortalUserColumnOptions): AdvancedDataTableColumn[] {
    return [
        {
            field: 'name',
            header: col('name'),
            sortField: 'name',
            width: 260,
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
            sortField: 'createdAt',
            width: 150,
            priority: 8,
            minWidth: 140,
            filterConfig: NOT_FILTERED,
            filterType: 'date',
            filterOperators: ['before', 'after', 'between'],
        },
        {
            field: 'portalRole',
            header: col('portalRole'),
            sortField: 'portalRole',
            width: 160,
            priority: 6,
            minWidth: 130,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: options.roles,
            filterOperators: ['eq', 'notEq'],
        },
        {
            field: 'status',
            header: col('status'),
            width: 130,
            priority: 7,
            minWidth: 120,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: options.statuses,
            filterOperators: ['eq', 'notEq'],
            mobile: { badge: true },
        },
        {
            field: 'actions',
            header: col('actions'),
            width: 130,
            priority: 9,
            minWidth: 130,
            filterConfig: NOT_FILTERED,
        },
    ];
}
