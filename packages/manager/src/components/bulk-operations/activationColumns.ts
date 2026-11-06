import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import type { BranchOption } from '../../api/orders';
import { READINESS_BADGE_VARIANT, READINESS_LABEL, READINESS_VALUES } from './activationReadiness';

export const UNASSIGNED_BRANCH = 'unassigned';

export function buildActivationColumns(branches: BranchOption[]): AdvancedDataTableColumn[] {
    return [
        {
            field: 'shortName',
            header: 'Company name',
            width: 220,
            minWidth: 160,
            maxWidth: 340,
            required: true,
            sortField: 'shortName',
            filterConfig: { type: 'text', placeholder: 'Company name contains…' },
            mobile: { primary: true },
        },
        {
            field: 'inn',
            header: 'INN',
            width: 130,
            sortField: 'inn',
            filterConfig: { type: 'none' },
        },
        // Sorts by the raw managerErpId though the cell shows a resolved name.
        {
            field: 'manager',
            header: 'Manager',
            width: 160,
            sortField: 'managerErpId',
            filterConfig: { type: 'text', placeholder: 'Manager contains…' },
        },
        {
            field: 'branch',
            header: 'Branch',
            width: 140,
            filterConfig: {
                type: 'select',
                placeholder: 'Any branch',
                options: [
                    { value: UNASSIGNED_BRANCH, label: 'Unassigned' },
                    ...branches.map(b => ({ value: b.id, label: b.name })),
                ],
            },
        },
        {
            field: 'phone',
            header: 'Phone',
            width: 150,
            sortField: 'phone',
            filterConfig: { type: 'none' },
            mobile: { hidden: true },
        },
        {
            field: 'officialEmail',
            header: 'Official email',
            width: 200,
            sortField: 'officialEmail',
            filterConfig: { type: 'none' },
        },
        {
            field: 'readiness',
            header: 'Portal access',
            width: 230,
            filterConfig: {
                type: 'status',
                placeholder: 'Any',
                options: READINESS_VALUES.map(value => ({
                    value,
                    label: READINESS_LABEL[value],
                    variant: READINESS_BADGE_VARIANT[value],
                })),
            },
            mobile: { badge: true },
        },
        {
            field: 'actions',
            header: 'Action',
            width: 120,
            filterConfig: { type: 'none' },
        },
    ];
}
