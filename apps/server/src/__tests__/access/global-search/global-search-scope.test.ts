import { describe, expect, it } from 'vitest';

import { admin, staffToken } from '../harness/actors';
import { STAFF, type ActorKey } from '../seed/fixture-plan';

interface Row {
    id: string;
    ref: string;
}

// Each kind: the list the portal already shows (the scope reference) and the field its search term is taken from.
const KINDS = [
    {
        kind: 'counterparty',
        root: 'counterparties',
        args: 'options: { take: 100 }',
        ref: 'shortName',
    },
    { kind: 'order', root: 'visibleOrders', args: 'list: { take: 100 }', ref: 'code' },
    {
        kind: 'proformaInvoice',
        root: 'visibleProformaInvoices',
        args: 'options: { take: 100 }',
        ref: 'number',
    },
    {
        kind: 'settlementDocument',
        root: 'visibleSettlementDocuments',
        args: 'options: { take: 100 }',
        ref: 'number',
    },
    {
        kind: 'discount',
        root: 'discountRegistryPage',
        args: 'options: { take: 100 }',
        ref: 'number',
    },
] as const;
type Kind = (typeof KINDS)[number];

const SEARCH = `query($t: String!) { globalSearch(term: $t, limitPerKind: 10) { kind items { id } } }`;
const SAMPLE = 6;

async function listRows(token: string, def: Kind): Promise<Row[] | null> {
    const query = `{ ${def.root}(${def.args}) { items { id ${def.ref} } } }`;
    const result = await admin<Record<string, { items: Record<string, string>[] }>>(token, query);
    if (result.errors.length > 0) return null;
    return result.data![def.root].items.map(i => ({ id: i.id, ref: i[def.ref] }));
}

async function hits(token: string, term: string): Promise<Map<string, Set<string>>> {
    const result = await admin<{ globalSearch: { kind: string; items: { id: string }[] }[] }>(
        token,
        SEARCH,
        {
            t: term,
        },
    );
    expect(result.errors, `globalSearch(${term}) must not error`).toEqual([]);
    return new Map(result.data!.globalSearch.map(g => [g.kind, new Set(g.items.map(i => i.id))]));
}

const actors: Array<ActorKey | 'superadmin'> = ['superadmin', ...STAFF.map(s => s.key)];

// The search must show exactly the rows the actor's own list shows: never more (scope), never fewer (broken search).
describe.each(KINDS)('global search, kind $kind', (def: Kind) => {
    it.each(actors)('%s finds a row if and only if the list shows it', async actor => {
        const universe = (await listRows(await staffToken('superadmin'), def)) ?? [];
        expect(universe.length, `the seed has ${def.kind} rows`).toBeGreaterThan(0);
        const token = await staffToken(actor);
        const own = await listRows(token, def);
        const visible = new Set((own ?? []).map(r => r.id));
        for (const row of universe.slice(0, SAMPLE).filter(r => r.ref.trim().length >= 2)) {
            const found = (await hits(token, row.ref)).get(def.kind);
            if (own === null)
                expect(found, `${def.kind} omitted without the read right`).toBeUndefined();
            else
                expect(found?.has(row.id) ?? false, `${def.kind} ${row.ref}`).toBe(
                    visible.has(row.id),
                );
        }
    });
});
