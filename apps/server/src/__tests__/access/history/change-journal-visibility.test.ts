import { beforeAll, describe, expect, inject, it } from 'vitest';

import { DENIED, admin, customerToken, seed, staffToken } from '../harness/actors';
import { gql } from '../harness/graphql';
import {
    CHANGE_JOURNAL_READERS,
    COUNTERPARTIES,
    STAFF,
    VISIBLE_COUNTERPARTIES,
    type ActorKey,
} from '../seed/fixture-plan';

const FOR_ENTITY = `query($t: String!, $id: ID!) { changeJournalForEntity(entityType: $t, entityId: $id, take: 100) {
    totalItems items { entityType entityId actorType userId administratorId source action changes } } }`;
const LIST = `query { changeJournal(take: 5) { totalItems items { id } } }`;

interface Entry {
    entityType: string;
    entityId: string;
    actorType: string;
    userId: string | null;
    administratorId: string | null;
    source: string;
    action: string;
    changes: Record<string, { before?: unknown; after?: unknown; redacted?: true }>;
}

interface Ref {
    entityType: string;
    entityId: string;
}

const key = (r: Ref): string => `${r.entityType}:${r.entityId}`;

function refs(): Ref[] {
    return COUNTERPARTIES.flatMap(c => [
        { entityType: 'Counterparty', entityId: seed().counterparties[c.key] },
        { entityType: 'TradingPoint', entityId: seed().points[c.key] },
    ]);
}

async function forEntity(token: string, ref: Ref): Promise<{ items: Entry[]; errors: string[] }> {
    const r = await admin<{ changeJournalForEntity: { items: Entry[] } }>(token, FOR_ENTITY, {
        t: ref.entityType,
        id: ref.entityId,
    });
    return { items: r.data?.changeJournalForEntity.items ?? [], errors: r.errors };
}

let superadmin: string;

beforeAll(async () => {
    superadmin = await staffToken('superadmin');
});

describe('change journal seed', () => {
    it('the creation of every seeded counterparty and point is journaled', async () => {
        for (const ref of refs()) {
            const got = await forEntity(superadmin, ref);
            expect(got.errors).toEqual([]);
            const insert = got.items.find(e => e.action === 'insert');
            expect(insert, key(ref)).toBeDefined();
        }
    });
});

const ACTING = { 'x-acting-session': '1' };

// Renames the customer and back; returns the journal entry of the rename.
async function renameCustomer(token: string, headers: Record<string, string>): Promise<Entry> {
    const call = <T>(query: string, variables?: Record<string, unknown>) =>
        gql<T>(inject('accessBaseUrl'), 'shop-api', query, variables, token, headers);
    const me = await call<{ activeCustomer: { id: string; firstName: string } }>(
        `query { activeCustomer { id firstName } }`,
    );
    expect(me.errors).toEqual([]);
    const { id, firstName: before } = me.data!.activeCustomer;
    const after = `${before}-x`;
    const rename = (f: string) =>
        call(`mutation($f: String!) { updateCustomer(input: { firstName: $f }) { id } }`, { f });
    expect((await rename(after)).errors).toEqual([]);
    try {
        const got = await forEntity(superadmin, { entityType: 'Customer', entityId: id });
        const entry = got.items.find(
            e => e.source === 'shop-api:updateCustomer' && e.changes.firstName?.after === after,
        );
        expect(entry).toBeDefined();
        expect(entry!.changes).toEqual({ firstName: { before, after } });
        return entry!;
    } finally {
        expect((await rename(before)).errors).toEqual([]);
    }
}

describe('actors', () => {
    it('an Admin API change is journaled with the administrator', async () => {
        const name = `journal-probe-${Date.now()}`;
        const created = await admin<{ createTag: { id: string } }>(
            superadmin,
            `mutation($v: String!) { createTag(input: { value: $v }) { id } }`,
            { v: name },
        );
        expect(created.errors).toEqual([]);
        const got = await forEntity(superadmin, {
            entityType: 'Tag',
            entityId: created.data!.createTag.id,
        });
        expect(got.items).toHaveLength(1);
        expect(got.items[0]).toMatchObject({
            actorType: 'administrator',
            action: 'insert',
            source: 'admin-api:createTag',
            changes: { value: { after: name } },
        });
        expect(got.items[0].administratorId).not.toBeNull();
    });

    it('a Shop API change is journaled with the customer and only the changed field', async () => {
        const entry = await renameCustomer(await customerToken('customer-a'), {});
        expect(entry).toMatchObject({ actorType: 'customer', administratorId: null });
    });

    it('a change in an acting session records the customer and the acting administrator', async () => {
        const me = await admin<{ activeAdministrator: { id: string } }>(
            superadmin,
            `query { activeAdministrator { id } }`,
        );
        const started = await admin<{ startActingSession: { ticket: string } }>(
            superadmin,
            `mutation($c: ID!) { startActingSession(counterpartyId: $c) { ticket } }`,
            { c: seed().counterparties['a-own'] },
        );
        expect(started.errors).toEqual([]);
        const exchanged = await gql<{ exchangeActingTicket: { token: string } }>(
            inject('accessBaseUrl'),
            'shop-api',
            `mutation($t: String!) { exchangeActingTicket(ticket: $t) { token } }`,
            { t: started.data!.startActingSession.ticket },
            undefined,
            ACTING,
        );
        expect(exchanged.errors).toEqual([]);
        const token = exchanged.data!.exchangeActingTicket.token;
        try {
            const entry = await renameCustomer(token, ACTING);
            expect(entry).toMatchObject({
                actorType: 'acting',
                administratorId: me.data!.activeAdministrator.id,
            });
            expect(entry.userId).not.toBeNull();
        } finally {
            await gql(
                inject('accessBaseUrl'),
                'shop-api',
                `mutation { finishActingSession }`,
                {},
                token,
                ACTING,
            );
        }
    });
});

describe.each(STAFF.map(s => s.key))('change journal for %s', (actor: ActorKey) => {
    const reads = CHANGE_JOURNAL_READERS.includes(actor);
    let token: string;

    beforeAll(async () => {
        token = await staffToken(actor);
    });

    it('entries by entity follow the counterparty visibility', async () => {
        const visible = VISIBLE_COUNTERPARTIES[actor];
        for (const c of COUNTERPARTIES) {
            for (const ref of refs().filter(
                r =>
                    r.entityId === seed().counterparties[c.key] ||
                    r.entityId === seed().points[c.key],
            )) {
                const got = await forEntity(token, ref);
                if (!reads) {
                    expect(got.errors.join(' '), key(ref)).toMatch(DENIED);
                    continue;
                }
                expect(got.errors).toEqual([]);
                expect(got.items.length > 0, key(ref)).toBe(visible.includes(c.key));
            }
        }
    });

    it('the cross-entity list needs scope all', async () => {
        const r = await admin<{ changeJournal: { totalItems: number } }>(token, LIST);
        if (!reads) {
            expect(r.errors.join(' ')).toMatch(DENIED);
            return;
        }
        expect(r.errors).toEqual([]);
        const all = STAFF.find(s => s.key === actor)!.scope === 'all';
        expect(r.data!.changeJournal.totalItems > 0).toBe(all);
    });
});
