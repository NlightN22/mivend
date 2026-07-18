import type { SelectOption } from '@mivend/ui-kit';
import { adminApi } from './client';

export interface RoleSummary {
    id: string;
    code: string;
    description: string;
}

export interface RoleDetail {
    id: string;
    code: string;
    description: string;
    permissions: string[];
}

export type ScopeKind = 'own' | 'department' | 'all';

export interface AccessScopeConfig {
    [resource: string]: ScopeKind;
}

export interface CreditTermLimit {
    roleCode: string;
    maxExtraDays: number;
    maxAmount: number | null;
}

export interface PermissionInfo {
    name: string;
    description: string;
}

export interface TeamMember {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    roleCode: string | null;
}

// The 6 manager-portal roles this app manages — distinct from Vendure's own built-in
// `__customer_role__`/`__super_admin_role__`, which the native `roles` query also returns and
// which must never be editable from here. Single source of truth for both the role-list query
// filter and the `/settings/roles/:code` route param validation.
export const KNOWN_ROLE_CODES = [
    'operator',
    'manager',
    'department-head',
    'general-director',
    'security-officer',
    'portal-admin',
] as const;

// Curated, UI-only grouping of the permissions this app's 6 roles actually use — mirrors
// infrastructure/scripts/seed-access-roles.mjs's per-role permission arrays. `Authenticated` is
// Vendure's own baseline permission auto-injected on every role — never shown as a checkbox.
export const PERMISSION_CATEGORIES: { key: string; label: string; permissionNames: string[] }[] = [
    {
        key: 'orders',
        label: 'Orders',
        permissionNames: ['ReadOrder', 'CreateOrder', 'UpdateOrder'],
    },
    { key: 'catalog', label: 'Catalog', permissionNames: ['ReadCatalog'] },
    {
        key: 'customers',
        label: 'Customers & Counterparties',
        permissionNames: [
            'ReadCustomer',
            'ReadCounterparty',
            'ReadCounterpartyCredit',
            'ReassignCounterpartyManager',
        ],
    },
    {
        key: 'pricing',
        label: 'Pricing & Discounts',
        permissionNames: [
            'AdjustPriceWithinLimit',
            'ReadFloorPrice',
            'RequestPriceAdjustmentApproval',
            'RequestDiscountGrantApproval',
            'RequestCreditTermApproval',
            'ApproveDiscountRequest',
            'ApproveSecurityLimit',
        ],
    },
    {
        key: 'admin',
        label: 'Administration & Audit',
        permissionNames: [
            'ManageAccessControl',
            'ManageApprovalWorkflows',
            'ReadEntityHistory',
            'ReadAdministrator',
            'UpdateAdministrator',
        ],
    },
];

export const SCOPE_OPTIONS: SelectOption[] = [
    { value: 'own', label: 'Own' },
    { value: 'department', label: 'Department' },
    { value: 'all', label: 'All' },
];

// The resources RoleScopeConfigService/AccessScopeService currently resolve scope for (see
// packages/plugins/access-control/src/access-scope.service.ts). 'teamVisibility' controls
// whether the /team directory shows colleagues' real names outside the viewer's own
// department ('own'/'department' = anonymized, 'all' = always shown) — it reuses this same
// generic resource-scope mechanism rather than a dedicated permission/flag.
export const SCOPE_RESOURCES = ['counterparty', 'order', 'teamVisibility'] as const;

export const SCOPE_RESOURCE_LABELS: Record<(typeof SCOPE_RESOURCES)[number], string> = {
    counterparty: 'Counterparty visibility',
    order: 'Order visibility',
    teamVisibility: 'Team directory name visibility',
};

export async function fetchRoles(): Promise<RoleSummary[]> {
    const result = await adminApi<{ roles: { items: RoleSummary[] } }>(
        `query Roles($codes: [String!]!) {
            roles(options: { filter: { code: { in: $codes } } }) {
                items { id code description }
            }
        }`,
        { codes: [...KNOWN_ROLE_CODES] },
    );
    return result.roles.items;
}

export async function fetchRoleDetail(code: string): Promise<RoleDetail | null> {
    const result = await adminApi<{ roles: { items: RoleDetail[] } }>(
        `query RoleDetail($code: String!) {
            roles(options: { filter: { code: { eq: $code } } }) {
                items { id code description permissions }
            }
        }`,
        { code },
    );
    return result.roles.items[0] ?? null;
}

export async function updateRolePermissions(id: string, permissions: string[]): Promise<void> {
    await adminApi(
        `mutation($id: ID!, $permissions: [Permission!]!) {
            updateRole(input: { id: $id, permissions: $permissions }) { id }
        }`,
        { id, permissions },
    );
}

export async function fetchAccessScopeConfig(code: string): Promise<AccessScopeConfig | null> {
    const result = await adminApi<{ roleAccessScopeConfig: string | null }>(
        `query RoleAccessScopeConfig($code: String!) { roleAccessScopeConfig(roleCode: $code) }`,
        { code },
    );
    return result.roleAccessScopeConfig
        ? (JSON.parse(result.roleAccessScopeConfig) as AccessScopeConfig)
        : null;
}

export async function setAccessScopeConfig(code: string, config: AccessScopeConfig): Promise<void> {
    await adminApi(
        `mutation($code: String!, $config: String!) {
            setRoleAccessScopeConfig(roleCode: $code, accessScopeConfig: $config)
        }`,
        { code, config: JSON.stringify(config) },
    );
}

export async function fetchCreditTermLimit(code: string): Promise<CreditTermLimit | null> {
    const result = await adminApi<{ creditTermLimit: CreditTermLimit | null }>(
        `query CreditTermLimit($code: String!) {
            creditTermLimit(roleCode: $code) { roleCode maxExtraDays maxAmount }
        }`,
        { code },
    );
    return result.creditTermLimit;
}

export async function setCreditTermLimit(
    code: string,
    maxExtraDays: number,
    maxAmount: number | null,
): Promise<void> {
    await adminApi(
        `mutation($code: String!, $maxExtraDays: Int!, $maxAmount: Int) {
            setCreditTermLimit(roleCode: $code, maxExtraDays: $maxExtraDays, maxAmount: $maxAmount) { roleCode }
        }`,
        { code, maxExtraDays, maxAmount },
    );
}

// Who holds which of the 6 seeded roles — the other half of Roles & Access ("what a role can
// do" vs "who has it"). Excludes the bootstrap superadmin account (__super_admin_role__) and
// any administrator not on one of KNOWN_ROLE_CODES, same curation rationale as fetchRoles().
export async function fetchTeamMembers(): Promise<TeamMember[]> {
    const result = await adminApi<{
        administrators: {
            items: {
                id: string;
                firstName: string;
                lastName: string;
                emailAddress: string;
                user: { roles: { code: string }[] };
            }[];
        };
    }>(
        `query SecurityAdministrators {
            administrators(options: { take: 200 }) {
                items { id firstName lastName emailAddress user { roles { code } } }
            }
        }`,
    );
    const known = new Set<string>(KNOWN_ROLE_CODES);
    return result.administrators.items
        .map(a => ({
            id: a.id,
            firstName: a.firstName,
            lastName: a.lastName,
            emailAddress: a.emailAddress,
            roleCode: a.user.roles[0]?.code ?? null,
        }))
        .filter(m => m.roleCode && known.has(m.roleCode));
}

export async function updateAdministratorRole(
    administratorId: string,
    roleId: string,
): Promise<void> {
    await adminApi(
        `mutation($id: ID!, $roleIds: [ID!]!) {
            updateAdministrator(input: { id: $id, roleIds: $roleIds }) { id }
        }`,
        { id: administratorId, roleIds: [roleId] },
    );
}

// Sourced from Vendure's own permission registry (native + custom, via globalSettings) rather
// than hardcoded descriptions — filtered to only the names this app curates in
// PERMISSION_CATEGORIES, since Vendure ships ~40 native CRUD permissions irrelevant to this app.
export async function fetchPermissionCatalog(): Promise<PermissionInfo[]> {
    const result = await adminApi<{
        globalSettings: { serverConfig: { permissions: PermissionInfo[] } };
    }>(
        `query PermissionCatalog { globalSettings { serverConfig { permissions { name description } } } }`,
    );
    const known = new Set(PERMISSION_CATEGORIES.flatMap(c => c.permissionNames));
    return result.globalSettings.serverConfig.permissions.filter(p => known.has(p.name));
}
