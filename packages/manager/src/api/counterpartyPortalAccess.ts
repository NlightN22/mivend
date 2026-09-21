import { adminApi } from './client';

// Issue #120 — Counterparty portal-access bulk activation ("Активация клиентов") + the
// Portal Users tab on the Counterparty detail page.
//
// Written as raw query strings (adminApi's pre-codegen escape hatch, see client.ts's own doc
// comment on issue #86) rather than through packages/manager/codegen.ts's generated
// TypedDocumentNode pipeline. Reconciled against the backend's actual shipped schema
// (packages/plugins/counterparty/src/counterparty-portal-access.resolver.ts) after both the
// backend and frontend halves of #120 landed in parallel:
// - There is no plural `activateCounterpartyPortalAccess(counterpartyIds: [ID!]!)` — the real
//   bulk path is the single `applyCounterpartyPortalAccessChanges(changes: [...])` batch mutation,
//   one item per row with an independent per-row result.
// - There is no separate `deactivateCounterpartyPortalUser` — the Portal Users tab's per-row
//   deactivate reuses the same `deactivateCounterpartyPortalAccess(customerId: ID!): Customer!`
//   the bulk table's batch path uses internally.
// - Batch result fields are `{ counterpartyId, success, error, customerId }`, not `{ ..., message }`.
// This file should still migrate into customers.graphql + real codegen'd documents, same as every
// other api/*.ts file in this package — left as raw strings here only because that migration is
// unrelated to the reconciliation itself.
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

// Mirrors the GraphQL `CounterpartySortParameter` input (counterparty.plugin.ts) — only real,
// server-sortable Counterparty columns, see that input's own doc comment for what's deliberately
// excluded (issue #138 tracks the remaining manager-portal tables' own sort audit).
export interface CounterpartySortParameter {
    shortName?: 'ASC' | 'DESC';
    inn?: 'ASC' | 'DESC';
    managerErpId?: 'ASC' | 'DESC';
    phone?: 'ASC' | 'DESC';
    officialEmail?: 'ASC' | 'DESC';
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
    sort?: CounterpartySortParameter;
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
            sort: options.sort,
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

// One real batch mutation, not N sequential calls — per #120's own carried-over bulk-edit
// decision. Both Activate and Deactivate go through this same mutation, distinguished by each
// change's own `action` field, matching the backend's actual single-mutation shape.
export async function applyCounterpartyPortalAccessChanges(
    changes: PortalAccessChange[],
): Promise<PortalAccessBatchResult[]> {
    const result = await adminApi<{
        applyCounterpartyPortalAccessChanges: PortalAccessBatchResult[];
    }>(APPLY_CHANGES_MUTATION, { changes });
    return result.applyCounterpartyPortalAccessChanges;
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

const DEACTIVATE_PORTAL_ACCESS_MUTATION = /* GraphQL */ `
    mutation DeactivateCounterpartyPortalAccess($customerId: ID!) {
        deactivateCounterpartyPortalAccess(customerId: $customerId) {
            id
        }
    }
`;

// Same mutation the bulk table's batch path uses internally for a 'deactivate' change — there is
// no separate single-customer variant. Throws on failure (e.g. no linked Customer); the caller
// shows the thrown message, there is no {success, message} result shape here.
export async function deactivateCounterpartyPortalUser(
    customerId: string,
): Promise<{ id: string }> {
    const result = await adminApi<{ deactivateCounterpartyPortalAccess: { id: string } }>(
        DEACTIVATE_PORTAL_ACCESS_MUTATION,
        { customerId },
    );
    return result.deactivateCounterpartyPortalAccess;
}
