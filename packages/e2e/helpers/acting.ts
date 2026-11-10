import { adminGql, shopGql } from './api';
import { E2E_API_USER_AGENT } from './user-agent';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';

export interface RawShopResponse<T> {
    data: T | null;
    errors: string[];
    setCookie: string[];
}

export async function rawShop<T>(
    query: string,
    variables: Record<string, unknown> | undefined,
    headers: Record<string, string>,
): Promise<RawShopResponse<T>> {
    const res = await fetch(`${SERVER_URL}/shop-api`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': E2E_API_USER_AGENT,
            ...headers,
        },
        body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    return {
        data: json.data ?? null,
        errors: (json.errors ?? []).map(e => e.message),
        setCookie: res.headers.getSetCookie(),
    };
}

export const actingHeaders = (token: string): Record<string, string> => ({
    'x-acting-session': '1',
    Authorization: `Bearer ${token}`,
});

export async function counterpartyIdByErpId(token: string, erpId: string): Promise<string> {
    const found = await adminGql<{ counterparties: { items: { id: string; erpId: string }[] } }>(
        `query($erpId: String!) { counterparties(options: { take: 1, erpIds: [$erpId] }) { items { id erpId } } }`,
        { erpId },
        token,
    );
    const id = found.data.counterparties.items.find(c => c.erpId === erpId)?.id;
    if (!id) throw new Error(`Counterparty ${erpId} is missing from the seed`);
    return id;
}

export async function startTicket(adminToken: string, counterpartyId: string): Promise<string> {
    const started = await adminGql<{ startActingSession: { ticket: string } }>(
        `mutation($c: ID!) { startActingSession(counterpartyId: $c) { ticket } }`,
        { c: counterpartyId },
        adminToken,
    );
    return started.data.startActingSession.ticket;
}

export async function exchangeTicket(ticket: string): Promise<
    RawShopResponse<{
        exchangeActingTicket: { token: string };
    }>
> {
    return rawShop(
        `mutation($t: String!) { exchangeActingTicket(ticket: $t) { token } }`,
        { t: ticket },
        { 'x-acting-session': '1' },
    );
}

export async function actingToken(adminToken: string, counterpartyId: string): Promise<string> {
    const res = await exchangeTicket(await startTicket(adminToken, counterpartyId));
    if (!res.data) throw new Error(`Acting exchange failed: ${res.errors.join('; ')}`);
    return res.data.exchangeActingTicket.token;
}

export async function counterpartyIdOfCustomerEmail(token: string, email: string): Promise<string> {
    const customers = await adminGql<{ customers: { items: { id: string }[] } }>(
        `query($e: String!) { customers(options: { filter: { emailAddress: { eq: $e } } }) { items { id } } }`,
        { e: email },
        token,
    );
    const customerId = customers.data.customers.items[0]?.id;
    const found = await adminGql<{
        counterparties: { items: { id: string; linkedCustomerId: string | null }[] };
    }>(
        `query { counterparties(options: { take: 1000 }) { items { id linkedCustomerId } } }`,
        undefined,
        token,
    );
    const id = found.data.counterparties.items.find(c => c.linkedCustomerId === customerId)?.id;
    if (!id) throw new Error(`No counterparty linked to ${email}`);
    return id;
}

interface Line {
    productVariant: { sku: string };
    quantity: number;
}
export interface Cart {
    activeOrder: { id: string; lines: Line[] } | null;
}
export const CART = `query { activeOrder { id lines { quantity productVariant { sku } } } }`;
export const ADD = `mutation($v: ID!, $q: Int!) { addItemToOrder(productVariantId: $v, quantity: $q) { __typename ... on ErrorResult { message } } }`;
export const skus = (c: Cart): string[] =>
    (c.activeOrder?.lines ?? []).map(l => l.productVariant.sku).sort();

export async function acting<T>(
    token: string,
    query: string,
    vars?: Record<string, unknown>,
): Promise<T> {
    const res = await rawShop<T>(query, vars, actingHeaders(token));
    if (!res.data) throw new Error(res.errors.join('; '));
    return res.data;
}

export async function customerState(
    cookie: string,
    customerId: string,
    adminToken: string,
): Promise<{
    sessions: string[];
    preferred: string | null;
    history: number;
    lastLogin: string | null;
}> {
    const s = await shopGql<{
        mySessions: { id: string }[];
        activeCustomer: { preferredTradingPoint: { id: string } | null };
    }>(
        `query { mySessions { id } activeCustomer { preferredTradingPoint { id } } }`,
        undefined,
        cookie,
    );
    const c = await adminGql<{
        customer: { user: { lastLogin: string | null }; history: { totalItems: number } };
    }>(
        `query($id: ID!) { customer(id: $id) { user { lastLogin } history { totalItems } } }`,
        { id: customerId },
        adminToken,
    );
    return {
        sessions: s.mySessions.map(x => x.id).sort(),
        preferred: s.activeCustomer.preferredTradingPoint?.id ?? null,
        history: c.data.customer.history.totalItems,
        lastLogin: c.data.customer.user.lastLogin,
    };
}

export async function variantIdsBySku(
    token: string,
    wanted: string[],
): Promise<Record<string, string>> {
    const found = await adminGql<{ productVariants: { items: { id: string; sku: string }[] } }>(
        `query($s: [String!]!) { productVariants(options: { take: 100, filter: { sku: { in: $s } } }) { items { id sku } } }`,
        { s: wanted },
        token,
    );
    return Object.fromEntries(found.data.productVariants.items.map(v => [v.sku, v.id]));
}
