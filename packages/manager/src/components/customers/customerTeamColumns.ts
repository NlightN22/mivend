import type { AdvancedDataTableColumn, StatusBadgeVariant } from '@mivend/ui-kit';

export interface TeamRow {
    [key: string]: unknown;
    id: string;
    member: string;
    role: string;
    isPrimary: boolean;
    primaryContact: string;
    email: string;
    phone: string;
    createdAt: string | null;
    administratorId: string | null;
    isOwner: boolean;
}

export const ROLE_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    primary: 'info',
    backup: 'neutral',
    'accounting-contact': 'neutral',
    observer: 'neutral',
};

export function buildTeamColumns(
    col: (field: string) => string,
    searchPlaceholder: string,
): AdvancedDataTableColumn[] {
    const none = { type: 'none' } as const;
    return [
        {
            field: 'member',
            header: col('member'),
            width: 200,
            required: true,
            filterConfig: { type: 'text', placeholder: searchPlaceholder },
            mobile: { primary: true },
        },
        { field: 'createdAt', header: col('createdAt'), width: 140, filterConfig: none },
        {
            field: 'role',
            header: col('role'),
            width: 170,
            filterConfig: none,
            mobile: { badge: true },
        },
        { field: 'primaryContact', header: col('primaryContact'), width: 130, filterConfig: none },
        { field: 'email', header: col('email'), width: 220, filterConfig: none },
        {
            field: 'phone',
            header: col('phone'),
            width: 150,
            filterConfig: none,
            mobile: { hidden: true },
        },
        { field: 'actions', header: col('actions'), width: 110, filterConfig: none },
    ];
}
