import { expect } from '@playwright/test';
import { select } from './contour-db';
import { customerCounterparty } from './document-scope';
import { adminCall } from './price-type-access';
import { shopCustomers } from './trading-point-scope';

export const ONE = `query($id: ID!) { counterparty(id: $id) { id linkedCustomerId } }`;
export const TEAM = `query($id: ID!) { counterparty(id: $id) { id teamMembers { administratorId role } } }`;
export const PORTAL = `query($id: ID!) { counterparty(id: $id) { id portalUsers { id } } }`;
export const CUSTOMER = `query($id: ID!) { customer(id: $id) { id emailAddress counterparty { id } preferredTradingPoint { id address } } }`;
export const CUSTOMERS = `query($f: CustomerFilterParameter) { customers(options: { take: 100, filter: $f }) { totalItems items { id } } }`;
export const ADD = `mutation($c: ID!, $a: ID!) { addCounterpartyTeamMember(counterpartyId: $c, administratorId: $a, role: "observer") { id } }`;
export const REMOVE = `mutation($c: ID!, $a: ID!) { removeCounterpartyTeamMember(counterpartyId: $c, administratorId: $a) }`;
export const DEACTIVATE = `mutation($id: ID!) { deactivateCounterpartyPortalAccess(customerId: $id) { id } }`;
export const BATCH = `mutation($c: ID!) { applyCounterpartyPortalAccessChanges(changes: [{ counterpartyId: $c, action: "deactivate" }]) { success error } }`;
export const DENIED = /not currently authorized|not found/i;

export interface Target {
    label: string;
    counterpartyId: string;
    customerIds: string[];
}

function linkedCustomers(counterpartyId: string): string[] {
    return select<{ id: string }>(
        `SELECT id::text AS id FROM customer WHERE "deletedAt" IS NULL
         AND "customFieldsCounterpartyid"::text = '${counterpartyId}' ORDER BY id`,
    ).map(r => r.id);
}

// The two test customers' clients (branch a and b) and a branch-less client with a portal customer.
export function teamTargets(): Target[] {
    const [a, b] = shopCustomers();
    const branchLess = select<{ id: string }>(
        `SELECT c.id::text AS id FROM counterparty c JOIN customer cu
           ON cu."customFieldsCounterpartyid"::text = c.id::text AND cu."deletedAt" IS NULL
         WHERE c."branchId" IS NULL ORDER BY c.id LIMIT 1`,
    )[0]?.id;
    const ids: [string, string | undefined][] = [
        ['branch-a client', a.login ? customerCounterparty(a.login.email) : undefined],
        ['branch-b client', b.login ? customerCounterparty(b.login.email) : undefined],
        ['branch-less client', branchLess],
    ];
    return ids
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
        .map(([label, id]) => ({ label, counterpartyId: id, customerIds: linkedCustomers(id) }));
}

export function customerRows(): { id: string; cp: string | null }[] {
    return select<{ id: string; cp: string | null }>(
        `SELECT id::text AS id, "customFieldsCounterpartyid"::text AS cp FROM customer WHERE "deletedAt" IS NULL`,
    );
}

export function teamRows(counterpartyId: string): string[] {
    return select<{ a: string }>(
        `SELECT "administratorId" AS a FROM counterparty_team_member
         WHERE "counterpartyId" = '${counterpartyId}' ORDER BY "administratorId"`,
    ).map(r => r.a);
}

export function activeCustomer(id: string): boolean {
    return (
        select<{ n: number }>(
            `SELECT count(*)::int AS n FROM customer WHERE id = ${Number(id)} AND "deletedAt" IS NULL`,
        )[0].n === 1
    );
}

export function hasPermission(adminId: string, permission: string): boolean {
    return (
        select<{ n: number }>(
            `SELECT count(*)::int AS n FROM administrator a JOIN user_roles_role ur ON ur."userId" = a."userId"
             JOIN role r ON r.id = ur."roleId" WHERE a.id = ${Number(adminId)}
             AND (r.permissions LIKE '%${permission}%' OR r.permissions LIKE '%SuperAdmin%')`,
        )[0].n > 0
    );
}

export async function customerIdsOf(
    token: string,
    filter?: Record<string, unknown>,
): Promise<{ ids: string[]; total: number }> {
    const result = await adminCall(token, CUSTOMERS, { f: filter });
    expect(result.errors).toEqual([]);
    const list = (result.data as { customers: { totalItems: number; items: { id: string }[] } })
        .customers;
    return { ids: list.items.map(i => i.id), total: list.totalItems };
}

export async function counterpartyField<T>(
    token: string,
    query: string,
    id: string,
): Promise<{ value: T | null; errors: string[] }> {
    const result = await adminCall(token, query, { id });
    const value = (result.data as { counterparty: T | null } | null)?.counterparty ?? null;
    return { value, errors: result.errors };
}
