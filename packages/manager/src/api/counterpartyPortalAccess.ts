import { adminApi } from './client';
import {
    CounterpartyActivationCandidatesDocument,
    type CounterpartyFilterParameter,
} from './generated/graphql';

// Raw strings below until codegen migration; backend only has batch applyCounterpartyPortalAccessChanges.
// phone/officialEmail are ERP-sourced and read-only, not manually entered.

export interface ActivationCandidate {
    id: string;
    shortName: string;
    inn: string | null;
    isActive: boolean;
    managerErpId: string | null;
    branchId: string | null;
    erpGroupLabel: string | null;
    phone: string | null;
    officialEmail: string | null;
    linkedCustomerId: string | null;
    portalReadiness: string;
}

// Must match server's CounterpartySortParameter; unsortable columns are left out on purpose.
export interface CounterpartySortParameter {
    shortName?: 'ASC' | 'DESC';
    inn?: 'ASC' | 'DESC';
    managerErpId?: 'ASC' | 'DESC';
    phone?: 'ASC' | 'DESC';
    officialEmail?: 'ASC' | 'DESC';
    creditLimit?: 'ASC' | 'DESC';
    creditBalance?: 'ASC' | 'DESC';
}

export interface ActivationCandidatesOptions {
    search?: string;
    readiness?: string;
    filter?: CounterpartyFilterParameter;
    take: number;
    skip: number;
    sort?: CounterpartySortParameter;
}

export async function fetchActivationCandidates(
    options: ActivationCandidatesOptions,
): Promise<{ items: ActivationCandidate[]; totalItems: number }> {
    const result = await adminApi(CounterpartyActivationCandidatesDocument, {
        options: {
            search: options.search || undefined,
            readiness: options.readiness || undefined,
            filter: options.filter,
            take: options.take,
            skip: options.skip,
            sort: options.sort,
        },
    });
    return result.counterparties;
}

const APPLY_CHANGES_MUTATION = /* GraphQL */ `
    mutation ApplyCounterpartyPortalAccessChanges(
        $changes: [CounterpartyPortalAccessChangeInput!]!
    ) {
        applyCounterpartyPortalAccessChanges(changes: $changes) {
            counterpartyId
            success
            error
            customerId
        }
    }
`;

export interface PortalAccessBatchResult {
    counterpartyId: string;
    success: boolean;
    error: string | null;
    customerId: string | null;
}

export type PortalAccessAction = 'activate' | 'deactivate';

export interface PortalAccessChange {
    counterpartyId: string;
    action: PortalAccessAction;
}

// One batch mutation on purpose, not N calls; activate and deactivate both use it.
// Direction is set by each change's own `action` field, the backend's only shape.
export async function applyCounterpartyPortalAccessChanges(
    changes: PortalAccessChange[],
): Promise<PortalAccessBatchResult[]> {
    const result = await adminApi<{
        applyCounterpartyPortalAccessChanges: PortalAccessBatchResult[];
    }>(APPLY_CHANGES_MUTATION, { changes });
    return result.applyCounterpartyPortalAccessChanges;
}

// Duplicate of dashboard's formatManager (counterparty-display.ts); keep both in sync.
// Fallback: linked Administrator's customFields.erpId, then unlinked ErpUser fullName, then raw id.
const MANAGER_LOOKUP_QUERY = /* GraphQL */ `
    query CounterpartyActivationManagerLookup {
        administrators(options: { take: 999 }) {
            # bounded: staff accounts
            items {
                id
                firstName
                lastName
                customFields {
                    erpId
                }
            }
        }
        pendingErpUsers(options: { take: 999 }) {
            # bounded: ERP staff users
            items {
                erpId
                fullName
            }
        }
    }
`;

export interface ManagerLookup {
    administrators: Array<{ id: string; name: string; erpId: string | null }>;
    erpUsers: Array<{ erpId: string; fullName: string | null }>;
}

export async function fetchManagerLookup(): Promise<ManagerLookup> {
    const result = await adminApi<{
        administrators: {
            items: Array<{
                id: string;
                firstName: string;
                lastName: string;
                customFields: { erpId: string | null } | null;
            }>;
        };
        pendingErpUsers: { items: Array<{ erpId: string; fullName: string | null }> };
    }>(MANAGER_LOOKUP_QUERY);
    return {
        administrators: result.administrators.items.map(a => ({
            id: a.id,
            name: `${a.firstName} ${a.lastName}`,
            erpId: a.customFields?.erpId ?? null,
        })),
        erpUsers: result.pendingErpUsers.items,
    };
}

export function formatManagerName(managerErpId: string | null, lookup: ManagerLookup): string {
    if (!managerErpId) return 'Unassigned';
    const admin = lookup.administrators.find(a => a.erpId === managerErpId);
    if (admin) return admin.name;
    const erpUser = lookup.erpUsers.find(u => u.erpId === managerErpId);
    if (erpUser?.fullName) return erpUser.fullName;
    return managerErpId;
}

export interface CounterpartyPortalUser {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    portalRole: string | null;
    active: boolean;
    createdAt: string;
}

const PORTAL_USERS_QUERY = /* GraphQL */ `
    query CounterpartyPortalUsers($counterpartyId: ID!) {
        counterparty(id: $counterpartyId) {
            id
            portalUsers {
                id
                firstName
                lastName
                emailAddress
                active
                createdAt
                customFields {
                    portalRole
                }
            }
        }
    }
`;

export async function fetchCounterpartyPortalUsers(
    counterpartyId: string,
): Promise<CounterpartyPortalUser[]> {
    const result = await adminApi<{
        counterparty: {
            portalUsers: Array<{
                id: string;
                firstName: string;
                lastName: string;
                emailAddress: string;
                active: boolean;
                createdAt: string;
                customFields: { portalRole: string | null } | null;
            }>;
        } | null;
    }>(PORTAL_USERS_QUERY, { counterpartyId });
    return (result.counterparty?.portalUsers ?? []).map(u => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        emailAddress: u.emailAddress,
        portalRole: u.customFields?.portalRole ?? null,
        active: u.active,
        createdAt: u.createdAt,
    }));
}

const DEACTIVATE_PORTAL_ACCESS_MUTATION = /* GraphQL */ `
    mutation DeactivateCounterpartyPortalAccess($customerId: ID!) {
        deactivateCounterpartyPortalAccess(customerId: $customerId) {
            id
        }
    }
`;

// Same mutation as the bulk path's 'deactivate' change; there is no single-customer variant.
// Throws on failure (e.g. no linked Customer); callers show the thrown message, no result object.
export async function deactivateCounterpartyPortalUser(
    customerId: string,
): Promise<{ id: string }> {
    const result = await adminApi<{ deactivateCounterpartyPortalAccess: { id: string } }>(
        DEACTIVATE_PORTAL_ACCESS_MUTATION,
        { customerId },
    );
    return result.deactivateCounterpartyPortalAccess;
}
