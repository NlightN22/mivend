import { adminApi } from './client';
import {
    CreateAdministratorFromErpUserDocument,
    PendingErpUsersPageDocument,
    PortalUserCountsDocument,
    PortalUsersDocument,
    ResetAdministratorPasswordDocument,
    SetAdministratorActiveDocument,
    type AdministratorListOptions,
    type PendingErpUserListOptions,
    type PortalUserStatus,
} from './generated/graphql';

// Issue #119 Phase 2 — manager-portal Settings > Users (see access-control.plugin.ts's own
// PortalUserStatus/portalUsers doc comments for the backend side).
export interface PortalUser {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    isActive: boolean;
    departmentId: string | null;
    roleCodes: string[];
}

export async function fetchPortalUsers(
    options: AdministratorListOptions,
    status?: PortalUserStatus,
): Promise<{ items: PortalUser[]; totalItems: number }> {
    const result = await adminApi(PortalUsersDocument, { options, status });
    return {
        items: result.portalUsers.items.map(a => ({
            id: a.id,
            firstName: a.firstName,
            lastName: a.lastName,
            emailAddress: a.emailAddress,
            isActive: a.isActive,
            departmentId: a.customFields?.departmentId ?? null,
            roleCodes: a.user?.roles?.map(r => r.code) ?? [],
        })),
        totalItems: result.portalUsers.totalItems,
    };
}

// No confirmation needed to re-enable a previously-deactivated account (issue #119 Phase 2
// concept notes) — only deactivation (isActive=false) needs the caller to confirm first, which
// UsersDataTable.vue's own modal handles before calling this.
export async function setAdministratorActive(id: string, isActive: boolean): Promise<void> {
    await adminApi(SetAdministratorActiveDocument, { id, isActive });
}

export interface PendingErpUserRow {
    id: string;
    erpId: string;
    fullName: string | null;
    email: string | null;
    departmentId: string | null;
}

export async function fetchPendingErpUsers(
    options: PendingErpUserListOptions,
): Promise<{ items: PendingErpUserRow[]; totalItems: number }> {
    const result = await adminApi(PendingErpUsersPageDocument, { options });
    return result.pendingErpUsers;
}

export async function createAdministratorFromErpUser(erpId: string): Promise<void> {
    await adminApi(CreateAdministratorFromErpUserDocument, { erpId });
}

export interface PortalUserCounts {
    users: number;
    pending: number;
}

export async function fetchPortalUserCounts(): Promise<PortalUserCounts> {
    const result = await adminApi(PortalUserCountsDocument);
    return { users: result.users.totalItems, pending: result.pending.totalItems };
}

export type ResetAdministratorPasswordReason = 'expired' | 'invalid' | 'validation';

export async function resetAdministratorPassword(
    token: string,
    password: string,
): Promise<{ success: boolean; reason: ResetAdministratorPasswordReason | null }> {
    const result = await adminApi(ResetAdministratorPasswordDocument, { token, password });
    return {
        success: result.resetAdministratorPassword.success,
        reason:
            (result.resetAdministratorPassword.reason as ResetAdministratorPasswordReason) ?? null,
    };
}
