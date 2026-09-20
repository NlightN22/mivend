import { adminApi } from './client';
import {
    AdministratorForPasswordResetTokenDocument,
    CreateAdministratorFromErpUserDocument,
    PendingErpUsersPageDocument,
    PortalUserCountsDocument,
    PortalUsersDocument,
    ResendAdministratorPasswordResetDocument,
    ResetAdministratorPasswordDocument,
    SetAdministratorActiveDocument,
    type AdministratorListOptions,
    type ErpUserListOptions,
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

// Issue #119: the only other way to get a fresh reset link was creating the account in the
// first place — this reuses the same token/event mechanism for an account that already exists.
export async function resendAdministratorPasswordReset(id: string): Promise<void> {
    await adminApi(ResendAdministratorPasswordResetDocument, { id });
}

export interface PendingErpUserRow {
    id: string;
    erpId: string;
    fullName: string | null;
    email: string | null;
    departmentId: string | null;
}

export async function fetchPendingErpUsers(
    options: ErpUserListOptions,
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

export interface PasswordResetIdentity {
    firstName: string;
    lastName: string;
    emailAddress: string;
}

// Issue #119: read-only lookup so /set-password can show whose account it's about to change —
// does not validate/consume the token, safe to call even on an expired/invalid link.
export async function fetchAdministratorForPasswordResetToken(
    token: string,
): Promise<PasswordResetIdentity | null> {
    const result = await adminApi(AdministratorForPasswordResetTokenDocument, { token });
    return result.administratorForPasswordResetToken ?? null;
}
