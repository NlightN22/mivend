import { expect, test } from '@playwright/test';
import { select } from './contour-db';
import { adminCall, superadminToken } from './price-type-access';
import {
    ACTORS,
    FIXTURES,
    actorState,
    actorToken,
    expectedIds,
    fixtureIds,
    type ActorKey,
} from './branch-actors';

const DENIED = /not currently authorized|forbidden|not found|not writable|outside/i;
const REASSIGN = `mutation($c: ID!, $a: ID!) { reassignCounterpartyManager(counterpartyId: $c, administratorId: $a) { id } }`;
const ACTIVATE = `mutation($c: ID!) { activateCounterpartyPortalAccess(counterpartyId: $c) { id } }`;
const OVERRIDE = `mutation($c: ID!, $b: String) { setCounterpartyBranchOverride(counterpartyId: $c, branchId: $b) }`;
const ONE = `query($id: ID!) { counterparty(id: $id) { id } }`;

const WRITERS: ActorKey[] = ['malyshev', 'plekhanova', 'medentsev', 'mishin', 'verevkina'];

let superadmin: string;
let hiddenFor: (key: ActorKey) => string;

const dbRow = (id: string): { manager: string | null; customers: number } =>
    select<{ manager: string | null; customers: number }>(
        `SELECT c."assignedManagerId" AS manager,
                (SELECT count(*)::int FROM customer cu WHERE cu."customFieldsCounterpartyid" = c.id::text) AS customers
         FROM counterparty c WHERE c.id = ${id}`,
    )[0];

test.beforeAll(async () => {
    superadmin = await superadminToken();
    const all = fixtureIds([...FIXTURES.branchA, ...FIXTURES.branchB, ...FIXTURES.noBranch]);
    const visibleBy = new Map<ActorKey, Set<string>>();
    for (const actor of ACTORS) visibleBy.set(actor.key, expectedIds(actor, actorState(actor)));
    hiddenFor = key => {
        const id = all.find(candidate => !visibleBy.get(key)?.has(candidate));
        if (!id) throw new Error(`${key} has no hidden fixture to attack`);
        return id;
    };
});

for (const key of WRITERS) {
    test(`10: ${key} cannot change a counterparty outside the scope, and nothing is written`, async () => {
        const token = await actorToken(key);
        const own = actorState(ACTORS.find(a => a.key === key)!).adminId;
        const id = hiddenFor(key);
        const before = dbRow(id);
        const attempts = [
            await adminCall(token, REASSIGN, { c: id, a: own }),
            await adminCall(token, ACTIVATE, { c: id }),
        ];
        for (const attempt of attempts) {
            expect(attempt.errors.join(), 'the write is rejected').toMatch(DENIED);
            expect(attempt.data).toBeNull();
        }
        expect(dbRow(id), 'no row changed').toEqual(before);
        const proof = await adminCall(superadmin, ONE, { id });
        expect(
            (proof.data as { counterparty: unknown }).counterparty,
            'the row exists for the superadmin',
        ).not.toBeNull();
    });
}

test('10: a department head reassigns a manager inside the branch (the denials are not vacuous) and it is restored', async () => {
    const token = await actorToken('malyshev');
    const id = fixtureIds(FIXTURES.branchA)[0];
    const other = actorState(ACTORS.find(a => a.key === 'plekhanova')!).adminId;
    const original = dbRow(id).manager;
    try {
        const ok = await adminCall(token, REASSIGN, { c: id, a: other });
        expect(ok.errors).toEqual([]);
        expect(dbRow(id).manager).toBe(other);
    } finally {
        if (original) await adminCall(superadmin, REASSIGN, { c: id, a: original });
    }
    expect(dbRow(id).manager, 'the original manager is back').toBe(original);
});

test('10: moving a counterparty to another branch moves it between the branch views, and the move is undone', async () => {
    const id = fixtureIds(FIXTURES.branchB)[1];
    const abakan = await actorToken('malyshev');
    const krasnoyarsk = await actorToken('medentsev');
    const visible = async (token: string): Promise<boolean> =>
        (((await adminCall(token, ONE, { id })).data as { counterparty: unknown } | null)
            ?.counterparty ?? null) !== null;
    const branchOf = (): string | null =>
        select<{ b: string | null }>(`SELECT "branchId" AS b FROM counterparty WHERE id = ${id}`)[0]
            .b;
    const original = branchOf();
    const target = select<{ b: string }>(
        `SELECT "customFieldsBranchid" AS b FROM administrator WHERE "emailAddress" = 'malyshev.test@example.com'`,
    )[0].b;
    expect(await visible(krasnoyarsk), 'starts in the Krasnoyarsk view').toBe(true);
    expect(await visible(abakan), 'starts hidden from the Abakan view').toBe(false);
    try {
        const moved = await adminCall(superadmin, OVERRIDE, { c: id, b: target });
        expect(moved.errors).toEqual([]);
        expect(await visible(abakan), 'now in the Abakan view').toBe(true);
        expect(await visible(krasnoyarsk), 'gone from the Krasnoyarsk view').toBe(false);
    } finally {
        await adminCall(superadmin, OVERRIDE, { c: id, b: null });
    }
    expect(branchOf(), 'the automatic rule restores the original branch').toBe(original);
    expect(await visible(krasnoyarsk)).toBe(true);
    expect(await visible(abakan)).toBe(false);
});
