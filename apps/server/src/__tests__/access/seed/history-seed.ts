import { gqlOk } from '../harness/graphql';
import { COUNTERPARTIES } from './fixture-plan';
import type { BaseSeedIds } from './seed-ids';

export const HISTORY_COMMENT = 'access history seed';

// Every counterparty and point gets a version row through a real staff mutation (#263 history).
export async function seedHistory(
    baseUrl: string,
    superadmin: string,
    ids: BaseSeedIds,
): Promise<void> {
    const call = (query: string, variables: Record<string, unknown>): Promise<unknown> =>
        gqlOk(baseUrl, 'admin-api', query, variables, superadmin);
    for (const c of COUNTERPARTIES) {
        // No override exists, so the branch stays as is; the call still records a Counterparty version.
        await call(
            `mutation($c: ID!) { setCounterpartyBranchOverride(counterpartyId: $c, branchId: null) }`,
            { c: ids.counterparties[c.key] },
        );
        await call(
            `mutation($id: ID!, $t: String) { updateTradingPointDetails(id: $id, input: { deliveryComment: $t }) { id } }`,
            { id: ids.points[c.key], t: HISTORY_COMMENT },
        );
    }
}
