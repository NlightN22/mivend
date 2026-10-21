import { select } from './contour-db';
import type { ActorState, BranchActor } from './branch-actors';

export interface SampleOrder {
    id: string;
    code: string;
    label: string;
}

const COUNTERPARTY = `COALESCE(o."customFieldsCounterpartyid", cu."customFieldsCounterpartyid")`;
// Read-time branch of docs/access-control.md: point override, else counterparty branch, else the default branch.
const BRANCH = `COALESCE(
    (SELECT tp."servicingBranchId" FROM trading_point tp WHERE tp.id::text = o."customFieldsTradingpointid"),
    cp."branchId",
    (SELECT "customFieldsDefaultbranchid" FROM global_settings LIMIT 1))`;
const FROM = `FROM "order" o LEFT JOIN customer cu ON cu.id = o."customerId"
    LEFT JOIN counterparty cp ON cp.id::text = ${COUNTERPARTY}`;

// One placed order per counterparty branch (and one without); orders whose point overrides the branch are left out.
export function sampleOrders(): SampleOrder[] {
    return select<SampleOrder>(`SELECT DISTINCT ON (coalesce(cp."branchId", 'none'))
            o.id::text AS id, o.code, 'counterparty branch ' || coalesce(cp."branchId", 'none') AS label
        ${FROM} WHERE o."orderPlacedAt" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM trading_point tp
            WHERE tp.id::text = o."customFieldsTradingpointid"
            AND tp."servicingBranchId" IS NOT NULL AND tp."servicingBranchId" IS DISTINCT FROM cp."branchId")
        ORDER BY coalesce(cp."branchId", 'none'), o.id DESC`);
}

export function expectedOrderIds(
    actor: BranchActor,
    state: ActorState,
    visibleCounterparties: Set<string>,
    orders: SampleOrder[],
): Set<string> {
    if (actor.scope === 'all') return new Set(orders.map(o => o.id));
    const rows = select<{ id: string; branch: string | null; counterparty: string | null }>(
        `SELECT o.id::text AS id, ${BRANCH} AS branch, ${COUNTERPARTY} AS counterparty
         ${FROM} WHERE o.id IN (${orders.map(o => o.id).join(',')})`,
    );
    // Branch scope also keeps own and granted clients; expectedIds already holds both for the actor.
    return new Set(
        rows
            .filter(
                r =>
                    (actor.scope === 'branch' && r.branch === state.branchId) ||
                    (r.counterparty !== null && visibleCounterparties.has(r.counterparty)),
            )
            .map(r => r.id),
    );
}

export function noteCount(orderId: string): number {
    return select<{ n: number }>(`SELECT count(*)::int AS n FROM history_entry
        WHERE "orderId" = ${orderId} AND type = 'ORDER_NOTE'`)[0].n;
}
