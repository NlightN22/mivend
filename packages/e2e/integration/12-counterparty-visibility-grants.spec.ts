import { expect, test } from '@playwright/test';
import { select } from './contour-db';
import { adminCall, superadminToken } from './price-type-access';
import {
    ACTORS,
    actorCredentials,
    actorState,
    actorToken,
    allFixtureErpIds,
    expectedIds,
    fixtureIds,
    type ActorKey,
} from './branch-actors';

const GRANT = `mutation($g: ID!, $m: ID!, $t: DateTime, $r: String!) { grantManagerVisibility(granteeAdministratorId: $g, managerAdministratorId: $m, validTo: $t, reason: $r) { id } }`;
const REVOKE = `mutation($i: ID!) { revokeVisibilityGrant(id: $i, reason: "e2e restore") { id } }`;
const ONE = `query($id: ID!) { counterparty(id: $id) { id } }`;
const LIST = `query { counterparties(options: { take: 1 }) { totalItems } }`;
const DENIED = /not currently authorized|not allowed|cannot|forbidden/i;

const actor = (key: ActorKey) => ACTORS.find(a => a.key === key)!;
const grantCount = (): number =>
    select<{ n: number }>(`SELECT count(*)::int AS n FROM visibility_grant`)[0].n;

test.beforeEach(() => {
    test.skip(
        !actorCredentials('head-b') || !actorCredentials('manager-a'),
        'the head-b or manager-a login is not set',
    );
});

test('12: a grant lets a head see the clients of a manager of another branch, and revoking takes it away', async () => {
    const superadmin = await superadminToken();
    const head = await actorToken('head-b');
    const headA = await actorToken('head-a');
    const grantee = actorState(actor('head-b'));
    const manager = actorState(actor('manager-a'));
    const all = fixtureIds(allFixtureErpIds());
    const before = expectedIds(actor('head-b'), grantee);
    const headABefore = expectedIds(actor('head-a'), actorState(actor('head-a')));
    const visible = async (token: string, id: string): Promise<boolean> =>
        (((await adminCall(token, ONE, { id })).data as { counterparty: unknown } | null)
            ?.counterparty ?? null) !== null;
    const total = async (token: string): Promise<number> =>
        ((await adminCall(token, LIST)).data as { counterparties: { totalItems: number } })
            .counterparties.totalItems;

    const hidden = all.filter(
        id =>
            !before.has(id) &&
            select<{ m: string }>(
                `SELECT "assignedManagerId" AS m FROM counterparty WHERE id = ${id}`,
            )[0].m === manager.adminId,
    );
    expect(
        hidden.length,
        'a fixture of the granted manager is hidden from the head before the grant',
    ).toBeGreaterThan(0);
    for (const id of hidden) expect(await visible(head, id)).toBe(false);
    expect(await total(head)).toBe(before.size);

    const validTo = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const granted = await adminCall(superadmin, GRANT, {
        g: grantee.adminId,
        m: manager.adminId,
        t: validTo,
        r: 'e2e visibility grant',
    });
    expect(granted.errors).toEqual([]);
    const grantId = (granted.data as { grantManagerVisibility: { id: string } })
        .grantManagerVisibility.id;
    try {
        const after = expectedIds(actor('head-b'), grantee);
        expect(after.size, 'the grant widens the scope').toBeGreaterThan(before.size);
        for (const id of hidden)
            expect(await visible(head, id), "the granted manager's fixture is visible").toBe(true);
        expect(await total(head), 'the total follows the union').toBe(after.size);
        expect(await total(headA), 'another head is not affected').toBe(headABefore.size);
    } finally {
        await adminCall(superadmin, REVOKE, { i: grantId });
    }
    for (const id of hidden)
        expect(await visible(head, id), 'hidden again after the revoke').toBe(false);
    expect(await total(head)).toBe(before.size);
});

test('12: a head with only the grant permission cannot grant to themselves or to someone outside their team, and nothing is written', async () => {
    const head = await actorToken('head-b');
    const self = actorState(actor('head-b'));
    const manager = actorState(actor('manager-a'));
    const outsider = actorState(actor('operator-a'));
    const rows = grantCount();
    const validTo = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    for (const grantee of [self, outsider]) {
        const attempt = await adminCall(head, GRANT, {
            g: grantee.adminId,
            m: manager.adminId,
            t: validTo,
            r: 'e2e must be refused',
        });
        expect(attempt.errors.join()).toMatch(DENIED);
        expect(attempt.data).toBeNull();
    }
    expect(grantCount(), 'no grant was written').toBe(rows);
});
