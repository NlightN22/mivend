import { adminGql } from '../../helpers/api';
import type { VisIds } from './ids';
import {
    ALLOWED_PRICE_TYPES,
    CLIENTS,
    POINT_OVERRIDE,
    STANDING_GRANT,
    TEAM_OBSERVER,
    VIS_PRICE_TYPES,
} from './plan';

// Manager, team, grant, servicing branch and branch settings are staff decisions, made through the Admin API.
export async function ensureRelations(superadmin: string, ids: VisIds): Promise<void> {
    const call = <T>(query: string, variables?: Record<string, unknown>): Promise<T> =>
        adminGql<T>(query, variables, superadmin).then(r => r.data);

    const types = await call<{ priceTypes: { id: string; code: string }[] }>(
        `{ priceTypes { id code } }`,
    );
    const typeId = (code: string): string => {
        const found = types.priceTypes.find(t => t.code === code)?.id;
        if (!found) throw new Error(`Price type ${code} is missing`);
        return found;
    };
    for (const key of ['a', 'b'] as const)
        await call(
            `mutation($b: String!, $t: String!, $v: [String!]) { setBranchSettings(branchId: $b,
                defaultPriceTypeId: $t, visiblePriceTypeIds: $v, defaultWarehouseId: "e2e-vis-placeholder") { id } }`,
            {
                b: ids.branches[key],
                t: typeId(VIS_PRICE_TYPES[key]),
                v: ALLOWED_PRICE_TYPES[key].map(typeId),
            },
        );

    for (const c of CLIENTS) {
        if (!c.manager) continue;
        await call(
            `mutation($c: ID!, $a: ID!) { reassignCounterpartyManager(counterpartyId: $c, administratorId: $a) { id } }`,
            { c: ids.clients[c.key], a: ids.admins[c.manager] },
        );
    }

    const team = await call<{ counterparty: { teamMembers: { administratorId: string }[] } }>(
        `query($id: ID!) { counterparty(id: $id) { teamMembers { administratorId } } }`,
        { id: ids.clients[TEAM_OBSERVER.client] },
    );
    const observer = ids.admins[TEAM_OBSERVER.actor];
    if (!team.counterparty.teamMembers.some(m => m.administratorId === observer))
        await call(
            `mutation($c: ID!, $a: ID!) { addCounterpartyTeamMember(counterpartyId: $c, administratorId: $a, role: "observer") { id } }`,
            { c: ids.clients[TEAM_OBSERVER.client], a: observer },
        );

    const grants = await call<{
        visibilityGrants: { items: { managerAdministratorId: string }[] };
    }>(
        `query($g: ID!) { visibilityGrants(granteeAdministratorId: $g, status: "active", take: 50) {
            items { managerAdministratorId } } }`,
        { g: ids.admins[STANDING_GRANT.grantee] },
    );
    const manager = ids.admins[STANDING_GRANT.manager];
    if (!grants.visibilityGrants.items.some(g => g.managerAdministratorId === manager))
        await call(
            `mutation($g: ID!, $m: ID!) { grantManagerVisibility(granteeAdministratorId: $g,
                managerAdministratorId: $m, reason: "e2e visibility seed") { id } }`,
            { g: ids.admins[STANDING_GRANT.grantee], m: manager },
        );

    await call(
        `mutation($id: ID!, $b: String) { updateTradingPointDetails(id: $id, input: { servicingBranchId: $b }) { id } }`,
        { id: ids.points[POINT_OVERRIDE.client], b: ids.branches[POINT_OVERRIDE.branch] },
    );
}
