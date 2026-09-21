import { adminApi } from './client';

// Issue #120 — Counterparty portal-access bulk activation ("Активация клиентов") + the
// Portal Users tab on the Counterparty detail page.
//
// Written as raw query strings (adminApi's pre-codegen escape hatch, see client.ts's own doc
// comment on issue #86) rather than through packages/manager/codegen.ts's generated
// TypedDocumentNode pipeline: at the time this file was written, a parallel session was still
// landing the backend mutations/fields this page needs, so running codegen against the live
// schema here would fail. `activateCounterpartyPortalAccess`/`deactivateCounterpartyPortalAccess`/
// `Counterparty.portalUsers` are ASSUMED names, chosen to match this project's existing
// convention (`reassignCounterpartyManager`, `Counterparty.linkedCustomerId`) — reconcile these
// against the backend's actual schema once it lands, then migrate this file into
// customers.graphql + real codegen'd documents, same as every other api/*.ts file in this
// package.
//
// `phone`/`officialEmail`/`linkedCustomerId` themselves are NOT assumed — they already exist on
// the admin schema's Counterparty type, ERP-sourced and read-only since issue #131 (see
// apps/server/src/dashboard/counterparty/counterparty.graphql.ts's CounterpartyItem fragment,
// shipped with #133). Issue #120's own Decision 6 ("phone/email entered manually on the detail
// page") predates #131 and is stale — #133's own body flags this exact correction as a follow-up
// still owed on #120's issue text. This page treats phone/officialEmail as already
// ERP-sourced, matching current reality, not Decision 6's original text.

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
}

export interface ActivationCandidatesOptions {
    take: number;
    skip: number;
    search?: string;
    status?: 'active' | 'inactive';
    managerErpId?: string;
    branchId?: string;
    erpGroupLabel?: string;
    // 'ready' = has phone+email, ERP-active, not yet linked; 'missing' = ERP-active but missing
    // phone/email; 'activated' = already linked to a Customer.
    portalAccess?: 'ready' | 'missing' | 'activated';
}

const ACTIVATION_CANDIDATES_QUERY = /* GraphQL */ `
    query CounterpartyActivationCandidates($options: CounterpartyListOptions) {
        counterparties(options: $options) {
            items {
                id
                shortName
                inn
                isActive
                managerErpId
                branchId
                erpGroupLabel
                phone
                officialEmail
                linkedCustomerId
            }
            totalItems
        }
    }
`;

export async function fetchActivationCandidates(
    options: ActivationCandidatesOptions,
): Promise<{ items: ActivationCandidate[]; totalItems: number }> {
    // portalAccess/status/managerErpId/branchId/erpGroupLabel/search all map onto
    // CounterpartyListOptions' own real fields (same shape customers.ts already uses) — the
    // readiness/portalAccess split itself has no single backend column, so it's computed
    // client-side per row below rather than sent as a filter arg the backend doesn't have.
    const result = await adminApi<{
        counterparties: { items: ActivationCandidate[]; totalItems: number };
    }>(ACTIVATION_CANDIDATES_QUERY, {
        options: {
            take: options.take,
            skip: options.skip,
            search: options.search || undefined,
            status: options.status,
            managerErpId: options.managerErpId || undefined,
            branchId: options.branchId || undefined,
            groupLabel: options.erpGroupLabel || undefined,
        },
    });
    return result.counterparties;
}

export function activationReadiness(
    c: Pick<ActivationCandidate, 'isActive' | 'phone' | 'officialEmail' | 'linkedCustomerId'>,
): 'ready' | 'missing-data' | 'erp-inactive' | 'activated' {
    if (c.linkedCustomerId) return 'activated';
    if (!c.isActive) return 'erp-inactive';
    if (!c.phone || !c.officialEmail) return 'missing-data';
    return 'ready';
}

const ACTIVATE_MUTATION = /* GraphQL */ `
    mutation ActivateCounterpartyPortalAccess($counterpartyIds: [ID!]!) {
        activateCounterpartyPortalAccess(counterpartyIds: $counterpartyIds) {
            counterpartyId
            success
            message
        }
    }
`;

const DEACTIVATE_MUTATION = /* GraphQL */ `
    mutation DeactivateCounterpartyPortalAccess($counterpartyIds: [ID!]!) {
        deactivateCounterpartyPortalAccess(counterpartyIds: $counterpartyIds) {
            counterpartyId
            success
            message
        }
    }
`;

export interface PortalAccessBatchResult {
    counterpartyId: string;
    success: boolean;
    message: string | null;
}

// One real batch mutation per action, not N sequential calls — per #120's own carried-over
// bulk-edit decision.
export async function activateCounterpartyPortalAccess(
    counterpartyIds: string[],
): Promise<PortalAccessBatchResult[]> {
    const result = await adminApi<{ activateCounterpartyPortalAccess: PortalAccessBatchResult[] }>(
        ACTIVATE_MUTATION,
        { counterpartyIds },
    );
    return result.activateCounterpartyPortalAccess;
}

export async function deactivateCounterpartyPortalAccess(
    counterpartyIds: string[],
): Promise<PortalAccessBatchResult[]> {
    const result = await adminApi<{
        deactivateCounterpartyPortalAccess: PortalAccessBatchResult[];
    }>(DEACTIVATE_MUTATION, { counterpartyIds });
    return result.deactivateCounterpartyPortalAccess;
}

// Manager-name resolution for the managerErpId column — same two-source fallback dashboard's
// counterparty-display.ts's formatManager already uses (a linked Administrator's customFields.
// erpId, else an unlinked ErpUser's fullName, else the raw id) — duplicated here in raw-string
// form for the same "backend not ready yet" reason as the rest of this file.
const MANAGER_LOOKUP_QUERY = /* GraphQL */ `
    query CounterpartyActivationManagerLookup {
        administrators(options: { take: 999 }) {
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

const DEACTIVATE_PORTAL_USER_MUTATION = /* GraphQL */ `
    mutation DeactivateCounterpartyPortalUser($customerId: ID!) {
        deactivateCounterpartyPortalUser(customerId: $customerId) {
            id
            success
            message
        }
    }
`;

export async function deactivateCounterpartyPortalUser(
    customerId: string,
): Promise<{ id: string; success: boolean; message: string | null }> {
    const result = await adminApi<{
        deactivateCounterpartyPortalUser: { id: string; success: boolean; message: string | null };
    }>(DEACTIVATE_PORTAL_USER_MUTATION, { customerId });
    return result.deactivateCounterpartyPortalUser;
}
