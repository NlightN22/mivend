import { expect, test } from '@playwright/test';
import { select } from './contour-db';
import { adminCall, superadminToken } from './price-type-access';
import {
    ACTORS,
    allFixtureErpIds,
    actorCredentials,
    actorState,
    actorToken,
    expectedIds,
    fixtureIds,
    type ActorState,
} from './branch-actors';

const LIST = `query($s: String) { counterparties(options: { take: 100, search: $s }) { totalItems items { id } } }`;
const ONE = `query($id: ID!) { counterparty(id: $id) { id } }`;
const SUMMARY = `query { counterpartySummary { totalCount } }`;

interface Listed {
    counterparties: { totalItems: number; items: { id: string }[] };
}

let superadmin: string;
let all: string[];
const names = new Map<string, string>();

test.beforeAll(async () => {
    superadmin = await superadminToken();
    all = fixtureIds(allFixtureErpIds());
    for (const row of select<{ id: string; name: string }>(
        `SELECT id::text AS id, "shortName" AS name FROM counterparty WHERE id IN (${all.join(',')})`,
    ))
        names.set(row.id, row.name);
});

async function visibleTo(token: string, id: string): Promise<boolean> {
    const result = await adminCall(token, ONE, { id });
    expect(result.errors, `counterparty(${id}) must not error`).toEqual([]);
    return (result.data as { counterparty: { id: string } | null }).counterparty !== null;
}

for (const actor of ACTORS) {
    test.describe(`8: ${actor.key} (${actor.role}, ${actor.scope} scope)`, () => {
        let token: string;
        let state: ActorState;
        let expected: Set<string>;

        test.beforeAll(async () => {
            if (!actorCredentials(actor.key)) return;
            state = actorState(actor);
            expected = expectedIds(actor, state);
            token = await actorToken(actor.key);
        });
        test.beforeEach(() => {
            test.skip(
                !actorCredentials(actor.key),
                `the ${actor.key} login is not set in the staging-integration env file`,
            );
        });

        test('has the role and scope the scenario assumes', () => {
            expect(state.roles).toContain(actor.role);
            if (actor.scope === 'branch')
                expect(state.branchId, 'a branch-scoped role needs a branch').not.toBeNull();
            if (actor.scope === 'all') expect(state.branchId).toBeNull();
        });

        test('list total and summary count equal the rows the scope allows, nothing more', async () => {
            const list = await adminCall(token, LIST);
            expect(list.errors).toEqual([]);
            expect((list.data as unknown as Listed).counterparties.totalItems).toBe(expected.size);
            const summary = await adminCall(token, SUMMARY);
            expect(summary.errors).toEqual([]);
            expect(
                (summary.data as { counterpartySummary: { totalCount: number } })
                    .counterpartySummary.totalCount,
            ).toBe(expected.size);
        });

        test('every fixture counterparty is visible exactly when the scope allows it, by id and by search', async () => {
            const hidden = all.filter(id => !expected.has(id));
            if (actor.scope !== 'all')
                expect(hidden.length, 'a hidden fixture exists for this actor').toBeGreaterThan(0);
            for (const id of all) {
                const shown = expected.has(id);
                expect(await visibleTo(token, id), `${names.get(id)} by id`).toBe(shown);
                const found = await adminCall(token, LIST, { s: names.get(id) });
                const ids = (found.data as unknown as Listed).counterparties.items.map(i => i.id);
                expect(ids.includes(id), `${names.get(id)} by search`).toBe(shown);
                if (!shown)
                    expect(
                        await visibleTo(superadmin, id),
                        `${names.get(id)} exists for the superadmin`,
                    ).toBe(true);
            }
        });
    });
}
