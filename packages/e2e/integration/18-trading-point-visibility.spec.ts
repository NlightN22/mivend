import { expect, test } from '@playwright/test';
import { shopLoginCookie } from '../helpers/api';
import { adminCall, superadminToken } from './price-type-access';
import { customerCounterparty, shop } from './document-scope';
import { readRun } from './run-state';
import { select } from './contour-db';
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
import {
    branchOf,
    expectedPointIds,
    pointRow,
    pointsOf,
    preferredPoint,
    samplePoints,
    shopCustomers,
    type SamplePoint,
} from './trading-point-scope';
import {
    ACTIVE,
    COMMENT,
    SHORT_NAME,
    DENIED,
    DETAILS,
    MOVE,
    NESTED,
    ONE,
    SEARCH,
    SHOP_NESTED,
    SHOP_WRITES,
    read,
    readAs,
    type Point,
} from './trading-point-queries';

let superadmin: string;
let fixtures: string[];
let points: SamplePoint[];

test.beforeAll(async () => {
    superadmin = await superadminToken();
    fixtures = fixtureIds(allFixtureErpIds());
    points = samplePoints(fixtures);
    expect(
        points.some(p => p.label === 'branch-less client'),
        'a point of a branch-less client',
    ).toBe(true);
});

for (const actor of ACTORS) {
    test.describe(`18: trading points for ${actor.key} (${actor.role}, ${actor.scope} scope)`, () => {
        let token: string;
        let counterparties: Set<string>;
        let expected: Set<string>;

        test.beforeAll(async () => {
            if (!actorCredentials(actor.key)) return;
            const state = actorState(actor);
            counterparties = expectedIds(actor, state);
            expected = expectedPointIds(actor, state, counterparties, points);
            token = await actorToken(actor.key);
        });
        test.beforeEach(() => {
            test.skip(!actorCredentials(actor.key), `the ${actor.key} login is not set`);
        });

        test('by id, with contacts, each point is visible exactly by the read-time branch rule', async () => {
            if (actor.scope !== 'all')
                expect(
                    points.some(p => !expected.has(p.id)),
                    'a hidden point',
                ).toBe(true);
            for (const point of points) {
                const shown = expected.has(point.id);
                const result = await adminCall(token, ONE, { id: point.id });
                expect(result.errors, `${point.label}: point ${point.id}`).toEqual([]);
                const got = (result.data as { tradingPoint: Point }).tradingPoint;
                expect(got !== null, `${point.label}: point ${point.id}`).toBe(shown);
                if (!shown)
                    expect(
                        await read(superadmin, point.id),
                        'the superadmin sees it',
                    ).not.toBeNull();
            }
        });

        test('nested on a counterparty and in the searched list, only points of visible counterparties', async () => {
            for (const cp of fixtures) {
                const result = await adminCall(token, NESTED, { id: cp });
                type Cp = { tradingPoints: { id: string }[] } | null;
                const got = (result.data as { counterparty: Cp } | null)?.counterparty ?? null;
                expect(got !== null, `counterparty ${cp}`).toBe(counterparties.has(cp));
                if (got) expect(got.tradingPoints.map(p => p.id).sort()).toEqual(pointsOf(cp));
            }
            for (const cp of fixtures.slice(0, 3)) {
                const name = (await adminCall(superadmin, SHORT_NAME, { id: cp })).data as {
                    counterparty: { shortName: string };
                };
                const listed = await adminCall(token, SEARCH, { s: name.counterparty.shortName });
                expect(listed.errors).toEqual([]);
                type Items = { items: { id: string; tradingPoints: { id: string }[] }[] };
                for (const item of (listed.data as { counterparties: Items }).counterparties
                    .items) {
                    expect(counterparties.has(item.id), `listed counterparty ${item.id}`).toBe(
                        true,
                    );
                    if (fixtures.includes(item.id))
                        expect(item.tradingPoints.map(p => p.id).sort()).toEqual(pointsOf(item.id));
                }
            }
        });

        test('a point of a hidden counterparty cannot be edited, deactivated or commented', async () => {
            const target = points.find(p => !counterparties.has(p.counterpartyId));
            test.skip(!target, 'the all-scope role has no hidden counterparty');
            const before = pointRow(target!.id);
            const writes = [
                await adminCall(token, DETAILS, {
                    id: target!.id,
                    input: {
                        deliveryComment: 'e2e-int probe',
                        contacts: [{ name: 'e2e-int probe' }],
                    },
                }),
                await adminCall(token, ACTIVE, { id: target!.id, a: !before.isActive }),
                await adminCall(token, COMMENT, { id: target!.id }),
            ];
            for (const w of writes) expect(w.errors.join(' '), `${target!.label}`).toMatch(DENIED);
            expect(pointRow(target!.id), 'nothing was written').toEqual(before);
        });
    });
}

const HEADS: ActorKey[] = ['head-a', 'head-b'];
const headsSet = (): boolean => HEADS.every(k => actorCredentials(k));

test.describe('18: moves between branches', () => {
    test.beforeEach(() => test.skip(!headsSet(), 'a head login is not set'));

    test('a contact edit on a branch-a point is seen in branch a only and is undone', async () => {
        const point = pointsOf(fixtureIds(FIXTURES.branchA)[0])[0];
        const before = pointRow(point);
        const contacts = (await read(superadmin, point))!.contacts;
        expect(contacts, 'the point has no contacts to restore').toEqual([]);
        const marker = `e2e-int-${readRun().startedAt.replace(/\D/g, '')}`;
        try {
            const set = await adminCall(await actorToken('head-a'), DETAILS, {
                id: point,
                input: { contacts: [{ name: marker, phone: '+70000000000', isPrimary: true }] },
            });
            expect(set.errors, 'head-a edits a point of its branch').toEqual([]);
            expect((await readAs('head-a', point))!.contacts.map(c => c.name)).toEqual([marker]);
            expect(
                await readAs('head-b', point),
                'head-b reads neither point nor contact',
            ).toBeNull();
            if (actorCredentials('manager-b')) expect(await readAs('manager-b', point)).toBeNull();
        } finally {
            await adminCall(superadmin, DETAILS, { id: point, input: { contacts: [] } });
        }
        expect(pointRow(point), 'contacts are back').toEqual(before);
    });

    test('a servicing branch override lets the other head read the point, not edit it, and is undone', async () => {
        const point = pointsOf(fixtureIds(FIXTURES.branchA)[0])[0];
        const before = pointRow(point);
        expect(before.servicingBranchId, 'the point starts without an override').toBeNull();
        expect(await readAs('head-b', point)).toBeNull();
        try {
            const set = await adminCall(superadmin, DETAILS, {
                id: point,
                input: { servicingBranchId: branchOf('head-b') },
            });
            expect(set.errors).toEqual([]);
            expect(
                await readAs('head-b', point),
                'head-b reads it through the override',
            ).not.toBeNull();
            expect(await readAs('head-a', point), 'head-a keeps its client').not.toBeNull();
            if (actorCredentials('manager-b')) expect(await readAs('manager-b', point)).toBeNull();
            const write = await adminCall(await actorToken('head-b'), DETAILS, {
                id: point,
                input: { deliveryComment: 'e2e-int probe' },
            });
            expect(write.errors.join(' '), 'writes stay counterparty-scoped').toMatch(DENIED);
        } finally {
            await adminCall(superadmin, DETAILS, { id: point, input: { servicingBranchId: null } });
        }
        expect(pointRow(point), 'the override is removed').toEqual(before);
    });

    test('a counterparty moved to another branch takes its points along, and the move is undone', async () => {
        const cp = fixtureIds(FIXTURES.branchB).find(id => pointsOf(id).length > 0)!;
        const point = pointsOf(cp)[0];
        const row = (): { b: string | null; o: string | null } =>
            select<{ b: string | null; o: string | null }>(
                `SELECT "branchId" AS b, "branchOverrideId" AS o FROM counterparty WHERE id = ${Number(cp)}`,
            )[0];
        const before = row();
        expect(before.b).toBe(branchOf('head-b'));
        expect(await readAs('head-b', point)).not.toBeNull();
        expect(await readAs('head-a', point)).toBeNull();
        try {
            const moved = await adminCall(superadmin, MOVE, { c: cp, b: branchOf('head-a') });
            expect(moved.errors).toEqual([]);
            expect(await readAs('head-a', point), 'now in branch a').not.toBeNull();
            expect(await readAs('head-b', point), 'gone from branch b').toBeNull();
        } finally {
            await adminCall(superadmin, MOVE, { c: cp, b: before.o });
        }
        expect(row(), 'branch and override are back').toEqual(before);
        expect(await readAs('head-b', point)).not.toBeNull();
        expect(await readAs('head-a', point)).toBeNull();
    });

    test('the default branch reads the point of a branch-less client, the other branch does not', async () => {
        const point = points.find(p => p.label === 'branch-less client')!;
        const fallback = select<{ d: string | null }>(
            `SELECT "customFieldsDefaultbranchid" AS d FROM global_settings LIMIT 1`,
        )[0].d;
        const home = HEADS.find(k => branchOf(k) === fallback);
        const other = HEADS.find(k => branchOf(k) !== fallback);
        test.skip(!home || !other, 'neither head is in the default branch');
        expect(await readAs(home!, point.id), `${home} reads it`).not.toBeNull();
        expect(await readAs(other!, point.id), `${other} does not`).toBeNull();
        const write = await adminCall(await actorToken(home!), DETAILS, {
            id: point.id,
            input: { deliveryComment: 'e2e-int probe' },
        });
        expect(write.errors.join(' '), 'and cannot edit it').toMatch(DENIED);
    });
});

const customers = shopCustomers();
for (const customer of customers) {
    const other = customers.find(c => c !== customer)!;
    test.describe(`18: ${customer.label} in the storefront`, () => {
        let cookie: string;
        let mine: string[];
        let foreign: string[];

        test.beforeAll(async () => {
            if (!customer.login || !other.login) return;
            cookie = await shopLoginCookie(customer.login.email, customer.login.password);
            mine = pointsOf(customerCounterparty(customer.login.email));
            foreign = pointsOf(customerCounterparty(other.login.email));
        });
        test.beforeEach(() =>
            test.skip(!customer.login || !other.login, 'a customer login is not set'),
        );

        test('nested on its own counterparty and among hidden points, only its own points', async () => {
            const nested = await shop<{
                activeCustomer: { counterparty: { tradingPoints: { id: string }[] } };
            }>(SHOP_NESTED, undefined, cookie);
            expect(nested.errors).toEqual([]);
            const ids = nested.data!.activeCustomer.counterparty.tradingPoints.map(p => p.id);
            expect(ids.length).toBeGreaterThan(0);
            for (const id of ids) expect(mine).toContain(id);
            const hidden = await shop<{ myHiddenTradingPoints: { id: string }[] }>(
                `query { myHiddenTradingPoints { id } }`,
                undefined,
                cookie,
            );
            expect(hidden.errors).toEqual([]);
            for (const p of hidden.data!.myHiddenTradingPoints) expect(mine).toContain(p.id);
            const guest = await shop<{ myTradingPoints: unknown[] }>(
                `query { myTradingPoints { id } }`,
            );
            expect(guest.data?.myTradingPoints ?? []).toEqual([]);
        });

        test("cannot edit, hide, restore, prefer or comment the other customer's point; nothing changes", async () => {
            const target = foreign[0];
            const before = pointRow(target);
            const preferred = preferredPoint(customer.login!.email);
            for (const write of SHOP_WRITES) {
                const result = await shop<Record<string, unknown>>(write, { id: target }, cookie);
                const value = result.data ? Object.values(result.data)[0] : null;
                expect(
                    result.errors.length > 0 || value === null || value === false,
                    `refused: ${write.slice(11, 50)}`,
                ).toBe(true);
            }
            expect(pointRow(target), 'the foreign point is unchanged').toEqual(before);
            expect(preferredPoint(customer.login!.email), 'the preferred point is unchanged').toBe(
                preferred,
            );
        });
    });
}
