import { expect } from 'vitest';

import { admin, seed, staffToken } from '../harness/actors';
import { COUNTERPARTIES, type CounterpartyKey } from '../seed/fixture-plan';

export const LIST = `query($s: String) { counterparties(options: { take: 100, search: $s }) { totalItems items { id } } }`;
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
