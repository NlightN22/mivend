import { adminApi } from './client';

export type CounterpartyTeamMemberRole = 'backup' | 'observer';

export interface CounterpartyTeamMember {
    id: string;
    administratorId: string;
    role: CounterpartyTeamMemberRole;
}

export async function fetchCounterpartyTeam(
    counterpartyId: string,
): Promise<CounterpartyTeamMember[]> {
    const result = await adminApi<{
        counterparty: { teamMembers: CounterpartyTeamMember[] } | null;
    }>(
        `query CounterpartyTeam($id: ID!) {
            counterparty(id: $id) {
                teamMembers { id administratorId role }
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
): Promise<CounterpartyTeamMember> {
    const result = await adminApi<{ addCounterpartyTeamMember: CounterpartyTeamMember }>(
        `mutation($counterpartyId: ID!, $administratorId: ID!, $role: String!) {
            addCounterpartyTeamMember(
                counterpartyId: $counterpartyId
                administratorId: $administratorId
                role: $role
            ) { id administratorId role }
        }`,
        { counterpartyId, administratorId, role },
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
