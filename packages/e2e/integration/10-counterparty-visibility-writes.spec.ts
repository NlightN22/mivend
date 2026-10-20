import { expect, test } from '@playwright/test';
import { select } from './contour-db';
import { adminCall, superadminToken } from './price-type-access';
import {
    ACTORS,
    FIXTURES,
    actorCredentials,
    actorState,
    actorToken,
    allFixtureErpIds,
    expectedIds,
    fixtureIds,
    type ActorKey,
} from './branch-actors';

const DENIED = /not currently authorized/i;
const REASSIGN = `mutation($c: ID!, $a: ID!) { reassignCounterpartyManager(counterpartyId: $c, administratorId: $a) { id } }`;
const OVERRIDE = `mutation($c: ID!, $b: String) { setCounterpartyBranchOverride(counterpartyId: $c, branchId: $b) }`;
const ONE = `query($id: ID!) { counterparty(id: $id) { id } }`;

// Roles holding ReassignCounterpartyManager: a refusal outside the branch is a scope refusal, not a permission one.
const HEADS: ActorKey[] = ['head-a', 'head-b'];
const WITHOUT_PERMISSION: ActorKey[] = ['operator-a', 'manager-a', 'manager-b'];

let superadmin: string;
let all: string[];
const visibleBy = new Map<ActorKey, Set<string>>();

const actor = (key: ActorKey) => ACTORS.find(a => a.key === key)!;
const hiddenFor = (key: ActorKey): string => {
    const id = all.find(candidate => !visibleBy.get(key)?.has(candidate));
    if (!id) throw new Error(`${key} has no hidden fixture to attack`);
    return id;
};
const managerOf = (id: string): string | null =>
    select<{ m: string | null }>(
        `SELECT "assignedManagerId" AS m FROM counterparty WHERE id = ${id}`,
    )[0].m;

test.beforeAll(async () => {
    superadmin = await superadminToken();
    all = fixtureIds(allFixtureErpIds());
    for (const a of ACTORS) {
        if (actorCredentials(a.key)) visibleBy.set(a.key, expectedIds(a, actorState(a)));
    }
});
test.beforeEach(() => {
    test.skip(
        !actorCredentials('head-a') || !actorCredentials('head-b'),
        'the head logins are not set',
    );
});

for (const key of HEADS) {
    test(`10: ${key} is refused for a counterparty outside the branch, nothing is written; inside the branch it works and is restored`, async () => {
        const token = await actorToken(key);
        const state = actorState(actor(key));
        const target = hiddenFor(key);
        const before = managerOf(target);
        const attempt = await adminCall(token, REASSIGN, { c: target, a: state.adminId });
        expect(attempt.errors.join(), 'a scope refusal').toMatch(DENIED);
        expect(attempt.data).toBeNull();
        expect(managerOf(target), 'nothing was written').toBe(before);
        expect(
            ((await adminCall(superadmin, ONE, { id: target })).data as { counterparty: unknown })
                .counterparty,
        ).not.toBeNull();

        const inside = [...visibleBy.get(key)!].find(
            id => all.includes(id) && managerOf(id) !== null,
        );
        expect(inside, 'a visible fixture with a manager').toBeDefined();
        const original = managerOf(inside!);
        try {
            const ok = await adminCall(token, REASSIGN, { c: inside!, a: state.adminId });
            expect(ok.errors, 'the same mutation works inside the branch').toEqual([]);
            expect(managerOf(inside!)).toBe(state.adminId);
        } finally {
            if (original !== null)
                await adminCall(superadmin, REASSIGN, { c: inside!, a: original });
        }
        expect(managerOf(inside!), 'the original manager is back').toBe(original);
    });
}

for (const key of WITHOUT_PERMISSION) {
    test(`10: ${key} has no permission to reassign managers, whatever the counterparty (permission denial, nothing written)`, async () => {
        test.skip(!actorCredentials(key), `the ${key} login is not set`);
        const token = await actorToken(key);
        const state = actorState(actor(key));
        for (const id of all.slice(0, 3)) {
            const before = managerOf(id);
            const attempt = await adminCall(token, REASSIGN, { c: id, a: state.adminId });
            expect(attempt.errors.join()).toMatch(DENIED);
            expect(managerOf(id)).toBe(before);
        }
    });
}

test('10: moving a counterparty to another branch moves it between the branch views, and the move is undone', async () => {
    const id = fixtureIds(FIXTURES.branchB).slice(-1)[0];
    const viewA = await actorToken('head-a');
    const viewB = await actorToken('head-b');
    const target = actorState(actor('head-a')).branchId!;
    const visible = async (token: string): Promise<boolean> =>
        (((await adminCall(token, ONE, { id })).data as { counterparty: unknown } | null)
            ?.counterparty ?? null) !== null;
    const row = (): { b: string | null; o: string | null } =>
        select<{ b: string | null; o: string | null }>(
            `SELECT "branchId" AS b, "branchOverrideId" AS o FROM counterparty WHERE id = ${id}`,
        )[0];
    const original = row();
    expect(await visible(viewB), 'starts in the branch-b view').toBe(true);
    expect(await visible(viewA), 'starts hidden from the branch-a view').toBe(false);
    try {
        const moved = await adminCall(superadmin, OVERRIDE, { c: id, b: target });
        expect(moved.errors).toEqual([]);
        expect(await visible(viewA), 'now in the branch-a view').toBe(true);
        expect(await visible(viewB), 'gone from the branch-b view').toBe(false);
    } finally {
        await adminCall(superadmin, OVERRIDE, { c: id, b: original.o });
    }
    expect(row(), 'branch and override are back').toEqual(original);
    expect(await visible(viewB)).toBe(true);
    expect(await visible(viewA)).toBe(false);
});
