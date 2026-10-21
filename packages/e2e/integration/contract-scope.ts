import { select } from './contour-db';
import { sampleOrders, type SampleOrder } from './order-scope';

export interface ContractOrder extends SampleOrder {
    contracts: string[];
}

// Active contracts with an organization of the order customer's counterparty: what orderContracts lists.
const CONTRACTS = (orderId: string): string => `SELECT k."erpId" FROM "order" o
    JOIN customer cu ON cu.id = o."customerId"
    JOIN contract k ON k."counterpartyId" = cu."customFieldsCounterpartyid"
    WHERE o.id = ${Number(orderId)} AND k."isActive" AND k."organizationId" <> '' ORDER BY k."erpId"`;

// One placed order per counterparty branch, plus the newest order of each client whose customer has contracts.
export function contractOrders(): ContractOrder[] {
    const withContracts = select<SampleOrder>(`SELECT DISTINCT ON (cp.id) o.id::text AS id, o.code,
            'client with contracts, branch ' || coalesce(cp."branchId", 'none') AS label
        FROM "order" o JOIN customer cu ON cu.id = o."customerId"
        JOIN counterparty cp ON cp.id::text = cu."customFieldsCounterpartyid"
        WHERE o."orderPlacedAt" IS NOT NULL AND EXISTS (SELECT 1 FROM contract k
            WHERE k."counterpartyId" = cp.id::text AND k."isActive" AND k."organizationId" <> '')
        ORDER BY cp.id, o.id DESC`);
    const all = [...sampleOrders(), ...withContracts].filter(
        (o, i, list) => list.findIndex(x => x.id === o.id) === i,
    );
    return all.map(o => ({
        ...o,
        contracts: select<{ erpId: string }>(CONTRACTS(o.id)).map(r => r.erpId),
    }));
}

export function selectedContract(orderId: string): string | null {
    return select<{ c: string | null }>(
        `SELECT "customFieldsSelectedcontractid" AS c FROM "order" WHERE id = ${Number(orderId)}`,
    )[0].c;
}

export function orderCounterparty(orderId: string): string {
    return select<{ id: string }>(`SELECT cu."customFieldsCounterpartyid" AS id FROM "order" o
        JOIN customer cu ON cu.id = o."customerId" WHERE o.id = ${Number(orderId)}`)[0].id;
}

export function customerContracts(counterpartyId: string): string[] {
    return select<{ id: string }>(`SELECT id::text AS id FROM contract
        WHERE "counterpartyId" = '${Number(counterpartyId)}' AND "isActive" AND "isCustomerContract" IS TRUE
        ORDER BY id`).map(r => r.id);
}

export function contractDocumentCount(counterpartyId: string): number {
    return select<{ n: number }>(`SELECT count(*)::int AS n FROM document
        WHERE "counterpartyId" = '${Number(counterpartyId)}' AND type = 'contract'`)[0].n;
}

export function counterpartyBranch(id: string): { b: string | null; o: string | null } {
    return select<{ b: string | null; o: string | null }>(
        `SELECT "branchId" AS b, "branchOverrideId" AS o FROM counterparty WHERE id = ${Number(id)}`,
    )[0];
}
