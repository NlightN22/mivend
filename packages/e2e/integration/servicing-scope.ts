import { select } from './contour-db';
import { adminCall } from './price-type-access';

export const ORDER = `query($id: ID!) { order(id: $id) { id customer { counterparty {
    shortName tradingPoints { id } teamMembers { id } linkedCustomerId } } } }`;
export const ORDER_PORTAL = `query($id: ID!) { order(id: $id) { customer { counterparty { portalUsers { id } } } } }`;
export const COUNTERPARTY = `query($id: ID!) { counterparty(id: $id) {
    id shortName tradingPoints { id } teamMembers { id } linkedCustomerId } }`;
export const COUNTERPARTY_PORTAL = `query($id: ID!) { counterparty(id: $id) { portalUsers { id } } }`;
// The counterparty lists the manager portal queries: customers page (searched), order create, approvals.
export const LISTS = [
    `query($s: String!) { counterparties(options: { take: 100, search: $s }) { items { id tradingPoints { id } } } }`,
    `query { counterparties(options: { take: 500 }) { items { id tradingPoints { id } } } }`,
];
export const COMMENT = `mutation($id: ID!, $c: String) { updateTradingPointComment(tradingPointId: $id, comment: $c) { id } }`;

export interface Cp {
    id?: string;
    shortName: string;
    tradingPoints: { id: string }[];
    teamMembers: { id: string }[];
    linkedCustomerId: string | null;
}

export function counterpartyOfPoint(pointId: string): string {
    return select<{ id: string }>(
        `SELECT "counterpartyId"::text AS id FROM trading_point WHERE id = ${Number(pointId)}`,
    )[0].id;
}

export async function orderCounterparty(
    token: string,
    orderId: string,
): Promise<{ cp: Cp | null; errors: string[] }> {
    const r = await adminCall(token, ORDER, { id: orderId });
    type D = { order: { customer: { counterparty: Cp | null } | null } | null } | null;
    return { cp: (r.data as D)?.order?.customer?.counterparty ?? null, errors: r.errors };
}

// Returns null with the error text when the field is denied (portalUsers needs ManageCounterpartyPortalAccess).
export async function portalUsers(
    token: string,
    query: string,
    id: string,
): Promise<{ ids: string[] | null; errors: string }> {
    const r = await adminCall(token, query, { id });
    const data = r.data as {
        order?: { customer: { counterparty: { portalUsers: { id: string }[] } | null } };
        counterparty?: { portalUsers: { id: string }[] } | null;
    } | null;
    const cp = data?.order?.customer.counterparty ?? data?.counterparty ?? null;
    return { ids: cp?.portalUsers.map(u => u.id) ?? null, errors: r.errors.join(' ') };
}

export async function counterpartyById(token: string, id: string): Promise<Cp | null> {
    const r = await adminCall(token, COUNTERPARTY, { id });
    return (r.data as { counterparty: Cp | null } | null)?.counterparty ?? null;
}

export async function listedPointIds(token: string, search: string): Promise<string[]> {
    const ids: string[] = [];
    for (const query of LISTS) {
        const r = await adminCall(token, query, { s: search });
        if (r.errors.length) throw new Error(`list query failed: ${r.errors.join(' ')}`);
        type Items = { items: { id: string; tradingPoints: { id: string }[] }[] };
        for (const item of (r.data as { counterparties: Items }).counterparties.items)
            ids.push(...item.tradingPoints.map(p => p.id), `cp:${item.id}`);
    }
    return ids;
}

export const ids = (list: { id: string }[]): string[] => list.map(x => x.id).sort();
