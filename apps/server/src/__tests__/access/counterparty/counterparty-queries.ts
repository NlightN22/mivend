import { expect } from 'vitest';

import { admin, seed, staffToken } from '../harness/actors';
import {
    COUNTERPARTIES,
    GAP_CLIENTS,
    VISIBLE_COUNTERPARTIES,
    VISIBLE_GAP_BRANCHES,
    type ActorKey,
    type CounterpartyKey,
} from '../seed/fixture-plan';

export const LIST = `query($s: String) { counterparties(options: { take: 100, search: $s }) { totalItems items { id } } }`;
export const PORTAL_STATES = ['none', 'invited', 'verified', 'active'] as const;
export const LIST_BY_STATE = `query($states: [String!]) { counterparties(options: { take: 100, filter: { portalState: { in: $states } } }) { totalItems items { id portalState } } }`;
export const ONE = `query($id: ID!) { counterparty(id: $id) { id } }`;
export const SUMMARY = `query { counterpartySummary { totalCount } }`;
export const STATE = `query($id: ID!) { counterparty(id: $id) { assignedManagerId branchId } }`;

export const ALL_KEYS: CounterpartyKey[] = COUNTERPARTIES.map(c => c.key);
export const idOf = (key: CounterpartyKey): string => seed().counterparties[key];

export async function visibleById(token: string, key: CounterpartyKey): Promise<boolean> {
    const result = await admin<{ counterparty: { id: string } | null }>(token, ONE, {
        id: idOf(key),
    });
    expect(result.errors, `counterparty(${key}) must not error`).toEqual([]);
    return result.data?.counterparty !== null && result.data?.counterparty !== undefined;
}

export async function listed(
    token: string,
    search?: string,
): Promise<{ total: number; ids: string[] }> {
    const result = await admin<{ counterparties: { totalItems: number; items: { id: string }[] } }>(
        token,
        LIST,
        { s: search },
    );
    expect(result.errors).toEqual([]);
    const page = result.data!.counterparties;
    return { total: page.totalItems, ids: page.items.map(i => i.id) };
}

export async function stateOf(
    key: CounterpartyKey,
): Promise<{ assignedManagerId: string | null; branchId: string | null }> {
    const result = await admin<{
        counterparty: { assignedManagerId: string | null; branchId: string | null };
    }>(await staffToken('superadmin'), STATE, { id: idOf(key) });
    expect(result.errors).toEqual([]);
    return result.data!.counterparty;
}

// Every counterparty id the actor's scope allows, the gap clients included.
export function visibleCounterpartyIds(key: ActorKey): string[] {
    const gaps = GAP_CLIENTS.filter(c => VISIBLE_GAP_BRANCHES[key].includes(c.branch));
    return [...VISIBLE_COUNTERPARTIES[key].map(idOf), ...gaps.map(c => seed().gapClients[c.erpId])];
}

export async function listedByPortalState(
    token: string,
    states: readonly string[],
): Promise<{ total: number; rows: { id: string; portalState: string | null }[] }> {
    const result = await admin<{
        counterparties: {
            totalItems: number;
            items: { id: string; portalState: string | null }[];
        };
    }>(token, LIST_BY_STATE, { states });
    expect(result.errors).toEqual([]);
    return {
        total: result.data!.counterparties.totalItems,
        rows: result.data!.counterparties.items,
    };
}
