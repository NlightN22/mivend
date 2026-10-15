import { adminApi } from './client';
import {
    AddCounterpartyTeamMemberDocument,
    CounterpartyTeamDocument,
    RemoveCounterpartyTeamMemberDocument,
    type CounterpartyTeamMemberFieldsFragment,
} from './generated/graphql';

export type CounterpartyTeamMemberRole = 'backup' | 'observer' | 'accounting-contact';

// GraphQL types role as a plain String, since business data must live in the DB, not enums.
// This portal only uses the fixed set above, so the narrowing lives here, not in each consumer.
export type CounterpartyTeamMember = Omit<CounterpartyTeamMemberFieldsFragment, 'role'> & {
    role: CounterpartyTeamMemberRole;
};

export async function fetchCounterpartyTeam(
    counterpartyId: string,
): Promise<CounterpartyTeamMember[]> {
    const result = await adminApi(CounterpartyTeamDocument, { id: counterpartyId });
    return (result.counterparty?.teamMembers ?? []) as CounterpartyTeamMember[];
}

// Gated on CustomPermission.ManageCounterpartyTeam — see CounterpartyTeamMutationResolver.
export async function addCounterpartyTeamMember(
    counterpartyId: string,
    administratorId: string,
    role: CounterpartyTeamMemberRole,
    phone?: string | null,
): Promise<CounterpartyTeamMember> {
    const result = await adminApi(AddCounterpartyTeamMemberDocument, {
        counterpartyId,
        administratorId,
        role,
        phone: phone ?? null,
    });
    return result.addCounterpartyTeamMember as CounterpartyTeamMember;
}

export async function removeCounterpartyTeamMember(
    counterpartyId: string,
    administratorId: string,
): Promise<void> {
    await adminApi(RemoveCounterpartyTeamMemberDocument, { counterpartyId, administratorId });
}
