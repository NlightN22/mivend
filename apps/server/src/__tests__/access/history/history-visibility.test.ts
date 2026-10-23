import { beforeAll, describe, expect, it } from 'vitest';

import { DENIED, admin, seed, staffToken } from '../harness/actors';
import {
    COUNTERPARTIES,
    GRANT_HISTORY_READERS,
    HISTORY_READERS,
    POINT_OVERRIDE,
    STANDING_GRANT,
    STAFF,
    VISIBLE_COUNTERPARTIES,
    VISIBLE_POINTS,
    type ActorKey,
} from '../seed/fixture-plan';

const ONE = `query($n: String!, $id: ID!) { entityVersions(entityName: $n, entityId: $id) { entityName entityId } }`;
const BATCH = `query($refs: [EntityRefInput!]!) { entityVersionsForEntities(refs: $refs, options: { take: 1000 }) {
    totalItems items { entityName entityId } } }`;
const GRANTS = `query($g: ID!) { visibilityGrants(granteeAdministratorId: $g, take: 100) { items { id managerAdministratorId } } }`;

interface Ref {
    entityName: string;
    entityId: string;
}

const key = (r: Ref): string => `${r.entityName}:${r.entityId}`;
const ALL = COUNTERPARTIES.map(c => c.key);
let grantId = '';

function refs(): Ref[] {
    return [
        ...ALL.map(c => ({ entityName: 'Counterparty', entityId: seed().counterparties[c] })),
        ...ALL.map(c => ({ entityName: 'TradingPoint', entityId: seed().points[c] })),
        { entityName: 'VisibilityGrant', entityId: grantId },
    ];
}

function expectedFor(actor: ActorKey): Set<string> {
    const cps = VISIBLE_COUNTERPARTIES[actor];
    const out = [
        ...cps.map(c => `Counterparty:${seed().counterparties[c]}`),
        ...cps.map(c => `TradingPoint:${seed().points[c]}`),
    ];
    if (GRANT_HISTORY_READERS.includes(actor)) out.push(`VisibilityGrant:${grantId}`);
    return new Set(out);
}

async function batch(token: string): Promise<{ keys: Set<string>; errors: string[] }> {
    const r = await admin<{ entityVersionsForEntities: { items: Ref[] } }>(token, BATCH, {
        refs: refs(),
    });
    return {
        keys: new Set((r.data?.entityVersionsForEntities.items ?? []).map(key)),
        errors: r.errors,
    };
}

async function one(token: string, ref: Ref): Promise<{ count: number; errors: string[] }> {
    const r = await admin<{ entityVersions: Ref[] }>(token, ONE, {
        n: ref.entityName,
        id: ref.entityId,
    });
    return { count: r.data?.entityVersions.length ?? 0, errors: r.errors };
}

let superadmin: string;
let everything: Set<string>;

beforeAll(async () => {
    superadmin = await staffToken('superadmin');
    const grants = await admin<{
        visibilityGrants: { items: { id: string; managerAdministratorId: string }[] };
    }>(superadmin, GRANTS, { g: seed().admins[STANDING_GRANT.grantee] });
    expect(grants.errors).toEqual([]);
    grantId = grants.data!.visibilityGrants.items.find(
        g => g.managerAdministratorId === seed().admins[STANDING_GRANT.manager],
    )!.id;
    everything = (await batch(superadmin)).keys;
});

describe('entity history seed', () => {
    it('superadmin sees a version of every counterparty, point and the standing grant', () => {
        expect(everything).toEqual(new Set(refs().map(key)));
    });
});

describe.each(STAFF.map(s => s.key))('entity history for %s', (actor: ActorKey) => {
    const reads = HISTORY_READERS.includes(actor);
    let token: string;

    beforeAll(async () => {
        token = await staffToken(actor);
    });

    it(
        reads ? 'batch history holds exactly the visible entities' : 'batch history is denied',
        async () => {
            const got = await batch(token);
            if (!reads) {
                expect(got.errors.join(' ')).toMatch(DENIED);
                return;
            }
            expect(got.errors).toEqual([]);
            expect(got.keys).toEqual(expectedFor(actor));
            if (STAFF.find(s => s.key === actor)!.scope === 'all') {
                expect(got.keys.size).toBeGreaterThan(0);
                expect(got.keys).toEqual(everything);
            } else {
                expect(
                    [...everything].some(k => !got.keys.has(k)),
                    'a hidden history exists',
                ).toBe(true);
            }
        },
    );

    it('history by id matches the visible set for every entity', async () => {
        const expected = expectedFor(actor);
        for (const ref of refs()) {
            const got = await one(token, ref);
            if (!reads) {
                expect(got.errors.join(' '), key(ref)).toMatch(DENIED);
                continue;
            }
            expect(got.errors).toEqual([]);
            expect(got.count > 0, key(ref)).toBe(expected.has(key(ref)));
        }
    });
});

describe('servicing branch and history', () => {
    it('head-b reads the serviced point but none of its history or its counterparty history', async () => {
        expect(VISIBLE_POINTS['head-b']).toContain(POINT_OVERRIDE.counterparty);
        const token = await staffToken('head-b');
        const point = {
            entityName: 'TradingPoint',
            entityId: seed().points[POINT_OVERRIDE.counterparty],
        };
        const cp = {
            entityName: 'Counterparty',
            entityId: seed().counterparties[POINT_OVERRIDE.counterparty],
        };
        expect(everything.has(key(point)) && everything.has(key(cp))).toBe(true);
        expect((await one(token, point)).count).toBe(0);
        expect((await one(token, cp)).count).toBe(0);
        const got = await batch(token);
        expect(got.keys.has(key(point))).toBe(false);
        expect(got.keys.has(key(cp))).toBe(false);
    });
});
