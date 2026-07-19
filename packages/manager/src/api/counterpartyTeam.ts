import { adminApi } from './client';

export type CounterpartyTeamMemberRole = 'backup' | 'observer' | 'accounting-contact';

export interface CounterpartyTeamMember {
    id: string;
    administratorId: string;
    role: CounterpartyTeamMemberRole;
    phone: string | null;
}

export async function fetchCounterpartyTeam(
    counterpartyId: string,
): Promise<CounterpartyTeamMember[]> {
    const result = await adminApi<{
        counterparty: { teamMembers: CounterpartyTeamMember[] } | null;
    }>(
        `query CounterpartyTeam($id: ID!) {
            counterparty(id: $id) {
                teamMembers { id administratorId role phone }
            }
        }`,
        { id: counterpartyId },
    );
    return result.counterparty?.teamMembers ?? [];
}

// Gated on CustomPermission.ManageCounterpartyTeam — see CounterpartyTeamMutationResolver.
export async function addCounterpartyTeamMember(
    counterpartyId: string,
    administratorId: string,
    role: CounterpartyTeamMemberRole,
    phone?: string | null,
): Promise<CounterpartyTeamMember> {
    const result = await adminApi<{ addCounterpartyTeamMember: CounterpartyTeamMember }>(
        `mutation($counterpartyId: ID!, $administratorId: ID!, $role: String!, $phone: String) {
            addCounterpartyTeamMember(
                counterpartyId: $counterpartyId
                administratorId: $administratorId
                role: $role
                phone: $phone
            ) { id administratorId role phone }
        }`,
        { counterpartyId, administratorId, role, phone: phone ?? null },
    );
    return result.addCounterpartyTeamMember;
}

export async function removeCounterpartyTeamMember(
    counterpartyId: string,
    administratorId: string,
): Promise<void> {
    await adminApi(
        `mutation($counterpartyId: ID!, $administratorId: ID!) {
            removeCounterpartyTeamMember(counterpartyId: $counterpartyId, administratorId: $administratorId)
        }`,
        { counterpartyId, administratorId },
    );
}
