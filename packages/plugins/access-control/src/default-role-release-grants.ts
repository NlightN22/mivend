export interface ReleasePermissionGrant {
    release: string;
    roleCode: string;
    permission: string;
}

export interface ReleaseScopeKeyGrant {
    release: string;
    roleCode: string;
    resource: string;
}

// Append-only: one entry per right or scope key a release adds to an existing default role.
// Each is applied once and recorded in role_default_grant; the value comes from DEFAULT_ROLES.
export const PERMISSIONS_ADDED_BY_RELEASE: ReleasePermissionGrant[] = [
    ...['department-head', 'general-director', 'security-officer', 'portal-admin'].map(
        roleCode => ({
            release: '1.1.8',
            roleCode,
            permission: 'ReadDeletedContractPowerOfAttorney',
        }),
    ),
    { release: '1.1.19', roleCode: 'general-director', permission: 'RemoveCounterpartyManager' },
    ...['manager', 'department-head', 'general-director'].map(roleCode => ({
        release: '1.1.19',
        roleCode,
        permission: 'ReadManagerCard',
    })),
    ...['manager', 'department-head', 'general-director'].map(roleCode => ({
        release: '1.1.22',
        roleCode,
        permission: 'ReadAnalytics',
    })),
    ...['manager', 'department-head'].map(roleCode => ({
        release: '1.1.39',
        roleCode,
        permission: 'ManageCounterpartyPortalAccess',
    })),
];

export const SCOPE_KEYS_ADDED_BY_RELEASE: ReleaseScopeKeyGrant[] = [];
