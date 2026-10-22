import { gqlOk } from '../harness/graphql';
import {
    BRANCH_TEAMS,
    COUNTERPARTIES,
    POINT_OVERRIDE,
    STANDING_GRANT,
    TEAM_OBSERVER,
} from './fixture-plan';
import type { BaseSeedIds } from './seed-ids';

// Manager, team, grant and servicing branch are staff decisions, made through the real Admin API.
export async function seedRelations(
    baseUrl: string,
    superadmin: string,
    ids: BaseSeedIds,
): Promise<void> {
    const call = (query: string, variables: Record<string, unknown>): Promise<unknown> =>
        gqlOk(baseUrl, 'admin-api', query, variables, superadmin);
    for (const c of COUNTERPARTIES) {
        if (!c.manager) continue;
        await call(
            `mutation($c: ID!, $a: ID!) { reassignCounterpartyManager(counterpartyId: $c, administratorId: $a) { id } }`,
            { c: ids.counterparties[c.key], a: ids.admins[c.manager] },
        );
    }
    for (const t of [TEAM_OBSERVER, ...BRANCH_TEAMS])
        await call(
            `mutation($c: ID!, $a: ID!) { addCounterpartyTeamMember(counterpartyId: $c, administratorId: $a, role: "observer") { id } }`,
            { c: ids.counterparties[t.counterparty], a: ids.admins[t.actor] },
        );
    await call(
        `mutation($g: ID!, $m: ID!) { grantManagerVisibility(granteeAdministratorId: $g, managerAdministratorId: $m, reason: "access seed") { id } }`,
        { g: ids.admins[STANDING_GRANT.grantee], m: ids.admins[STANDING_GRANT.manager] },
    );
    await call(
        `mutation($id: ID!, $b: String) { updateTradingPointDetails(id: $id, input: { servicingBranchId: $b }) { id } }`,
        { id: ids.points[POINT_OVERRIDE.counterparty], b: ids.branches.b },
    );
}
