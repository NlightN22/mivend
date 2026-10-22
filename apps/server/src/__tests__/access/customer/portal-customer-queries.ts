import { expect } from 'vitest';

import { admin, seed, staffToken } from '../harness/actors';
import type { CounterpartyKey } from '../seed/fixture-plan';

export const ONE = `query($id: ID!) { counterparty(id: $id) { id linkedCustomerId } }`;
export const TEAM = `query($id: ID!) { counterparty(id: $id) { id teamMembers { administratorId role } } }`;
export const PORTAL = `query($id: ID!) { counterparty(id: $id) { id portalUsers { id } } }`;
export const CUSTOMER = `query($id: ID!) { customer(id: $id) { id emailAddress counterparty { id } } }`;
export const CUSTOMERS = `query($f: CustomerFilterParameter) { customers(options: { take: 100, filter: $f }) {
    totalItems items { id counterparty { id } } } }`;
export const ADD = `mutation($c: ID!, $a: ID!) { addCounterpartyTeamMember(counterpartyId: $c, administratorId: $a, role: "observer") { id } }`;
export const REMOVE = `mutation($c: ID!, $a: ID!) { removeCounterpartyTeamMember(counterpartyId: $c, administratorId: $a) }`;
export const DEACTIVATE = `mutation($id: ID!) { deactivateCounterpartyPortalAccess(customerId: $id) { id } }`;
export const BATCH = `mutation($c: ID!) { applyCounterpartyPortalAccessChanges(changes: [{ counterpartyId: $c, action: "deactivate" }]) { success error } }`;
export const HIDDEN_WRITE = /not currently authorized|not found/i;

export interface CustomerPage {
    total: number;
    items: { id: string; counterparty: { id: string } | null }[];
}

export async function customerList(
    token: string,
    filter?: Record<string, unknown>,
): Promise<CustomerPage> {
    const result = await admin<{ customers: { totalItems: number; items: CustomerPage['items'] } }>(
        token,
        CUSTOMERS,
        { f: filter },
    );
    expect(result.errors).toEqual([]);
    return { total: result.data!.customers.totalItems, items: result.data!.customers.items };
}

// The portal customers of a counterparty, as the superadmin sees them.
export async function linkedCustomers(key: CounterpartyKey): Promise<string[]> {
    const page = await customerList(await staffToken('superadmin'), {
        counterpartyId: { eq: seed().counterparties[key] },
    });
    return page.items.map(i => i.id).sort();
}

export async function counterpartyField<T>(
    token: string,
    query: string,
    key: CounterpartyKey,
): Promise<{ value: T | null; errors: string[] }> {
    const result = await admin<{ counterparty: T | null }>(token, query, {
        id: seed().counterparties[key],
    });
    return { value: result.data?.counterparty ?? null, errors: result.errors };
}

export async function customerById(token: string, id: string): Promise<string | null> {
    const result = await admin<{ customer: { id: string } | null }>(token, CUSTOMER, { id });
    expect(result.errors).toEqual([]);
    return result.data!.customer?.id ?? null;
}
