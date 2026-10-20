import { adminApi } from './client';
import {
    GrantManagerVisibilityDocument,
    RevokeVisibilityGrantDocument,
    UnsortedAdministratorsDocument,
    UnsortedCounterpartiesDocument,
    VisibilityGrantPickersDocument,
    VisibilityGrantsDocument,
    type UnsortedAdministratorsQuery,
    type UnsortedCounterpartiesQuery,
    type VisibilityGrantFieldsFragment,
} from './generated/graphql';

export type VisibilityGrantRow = VisibilityGrantFieldsFragment;
export type UnsortedCounterpartyRow =
    UnsortedCounterpartiesQuery['unsortedCounterparties']['items'][number];
export type UnsortedAdministratorRow =
    UnsortedAdministratorsQuery['unsortedAdministrators']['items'][number];

export interface Page<T> {
    items: T[];
    totalItems: number;
}

export interface PageArgs {
    skip: number;
    take: number;
}

export const VISIBILITY_STATUS_VARIANT = {
    active: 'success',
    scheduled: 'info',
    expired: 'neutral',
    revoked: 'neutral',
} as const;

export const VISIBILITY_STATUS_OPTIONS = [
    { value: 'active', label: 'Active', variant: 'success' },
    { value: 'scheduled', label: 'Scheduled', variant: 'info' },
    { value: 'expired', label: 'Expired', variant: 'neutral' },
    { value: 'revoked', label: 'Revoked', variant: 'neutral' },
] as const;

export async function fetchVisibilityGrants(
    args: PageArgs & { status?: string; search?: string },
): Promise<Page<VisibilityGrantRow>> {
    const result = await adminApi(VisibilityGrantsDocument, {
        ...args,
        status: args.status || undefined,
        search: args.search || undefined,
    });
    return result.visibilityGrants;
}

export interface AdministratorOption {
    value: string;
    label: string;
}

export async function fetchAdministratorOptions(): Promise<AdministratorOption[]> {
    const result = await adminApi(VisibilityGrantPickersDocument);
    return result.visibilityGrantCandidates.map(a => ({
        value: a.id,
        label: `${a.firstName} ${a.lastName}`.trim(),
    }));
}

export interface GrantInput {
    granteeAdministratorId: string;
    managerAdministratorId: string;
    validFrom: string | null;
    validTo: string | null;
    reason: string;
}

export async function grantManagerVisibility(input: GrantInput): Promise<void> {
    await adminApi(GrantManagerVisibilityDocument, input);
}

export async function revokeVisibilityGrant(id: string, reason: string): Promise<void> {
    await adminApi(RevokeVisibilityGrantDocument, { id, reason: reason || undefined });
}

export async function fetchUnsortedCounterparties(
    args: PageArgs & { search?: string },
): Promise<Page<UnsortedCounterpartyRow>> {
    const result = await adminApi(UnsortedCounterpartiesDocument, {
        ...args,
        search: args.search || undefined,
    });
    return result.unsortedCounterparties;
}

export async function fetchUnsortedAdministrators(
    args: PageArgs,
): Promise<Page<UnsortedAdministratorRow>> {
    return (await adminApi(UnsortedAdministratorsDocument, args)).unsortedAdministrators;
}
