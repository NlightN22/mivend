import { select } from './contour-db';
import { expectedOrderIds } from './order-scope';
import type { ActorState, BranchActor } from './branch-actors';

export interface SampleProforma {
    id: string;
    number: string;
    status: string;
    orderId: string;
    counterpartyId: string;
    pointId: string;
    homeBranchId: string;
}

// The newest issued and the newest cancelled proforma of one order-placed point whose counterparty has a branch.
export function sampleProformas(): SampleProforma[] {
    return select<SampleProforma>(`SELECT DISTINCT ON (pi.status) pi.id::text AS id, pi.number, pi.status,
            pi."orderId"::text AS "orderId", pi."counterpartyId"::text AS "counterpartyId",
            tp.id::text AS "pointId", cp."branchId" AS "homeBranchId"
        FROM proforma_invoice pi JOIN "order" o ON o.id = pi."orderId"
        JOIN trading_point tp ON tp.id::text = o."customFieldsTradingpointid"
        JOIN counterparty cp ON cp.id::text = pi."counterpartyId"::text
        WHERE pi.status IN ('issued', 'cancelled') AND tp."servicingBranchId" IS NULL AND cp."branchId" IS NOT NULL
          AND tp.id = (SELECT tp2.id FROM proforma_invoice p2 JOIN "order" o2 ON o2.id = p2."orderId"
              JOIN trading_point tp2 ON tp2.id::text = o2."customFieldsTradingpointid"
              WHERE p2.status = 'issued' AND tp2."servicingBranchId" IS NULL ORDER BY p2.id DESC LIMIT 1)
        ORDER BY pi.status, pi.id DESC`);
}

// A proforma's read-time branch is its order's (docs/access-control.md), so its visibility is the order's.
export function expectedProformaIds(
    actor: BranchActor,
    state: ActorState,
    visibleCounterparties: Set<string>,
    proformas: SampleProforma[],
): Set<string> {
    const orders = proformas.map(p => ({ id: p.orderId, code: p.orderId, label: p.number }));
    const visibleOrders = expectedOrderIds(actor, state, visibleCounterparties, orders);
    return new Set(proformas.filter(p => visibleOrders.has(p.orderId)).map(p => p.id));
}

export function counterpartyProformaCount(counterpartyId: string): number {
    return select<{ n: number }>(`SELECT count(*)::int AS n FROM proforma_invoice
        WHERE "counterpartyId"::text = '${counterpartyId}'`)[0].n;
}

export function proformaStatus(id: string): string {
    return select<{ s: string }>(`SELECT status AS s FROM proforma_invoice WHERE id = ${id}`)[0].s;
}
