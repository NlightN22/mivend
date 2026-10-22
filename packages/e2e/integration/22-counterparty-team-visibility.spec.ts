import { expect, test } from '@playwright/test';
import { adminCall, superadminToken, visit } from './price-type-access';
import { openManagerAs } from './branch-pages';
import {
    ACTORS,
    actorCredentials,
    actorState,
    actorToken,
    expectedIds,
    type ActorKey,
} from './branch-actors';
import {
    ADD,
    CUSTOMER,
    DENIED,
    REMOVE,
    TEAM,
    counterpartyField,
    hasPermission,
    teamRows,
    teamTargets,
    type Target,
} from './team-scope';

type Team = { teamMembers: { administratorId: string; role: string }[] };
const SHOTS = 'g21';

let superadmin: string;
let target: Target;
let member: string;
let before: string[];

const adminOf = (key: ActorKey): string => actorState(ACTORS.find(a => a.key === key)!).adminId;
const actorsSet = (): boolean =>
    (['manager-a', 'head-a', 'head-b'] as ActorKey[]).every(k => actorCredentials(k));

test.describe.serial('22: a counterparty team follows the counterparty', () => {
    test.beforeAll(async () => {
        if (!actorsSet()) return;
        superadmin = await superadminToken();
        target = teamTargets().find(t => t.label === 'branch-b client')!;
        member = adminOf('manager-a');
        before = teamRows(target.counterpartyId);
        expect(before, 'manager-a is not yet on the team').not.toContain(member);
        expect(expectedIds(ACTORS[0], actorState(ACTORS[0])).has(target.counterpartyId)).toBe(
            false,
        );
        const added = await adminCall(superadmin, ADD, { c: target.counterpartyId, a: member });
        expect(added.errors).toEqual([]);
        expect(teamRows(target.counterpartyId)).toContain(member);
    });
    test.beforeEach(() => test.skip(!actorsSet(), 'a manager-a/head-a/head-b login is not set'));

    test.afterAll(async () => {
        if (!target) return;
        if (teamRows(target.counterpartyId).includes(member))
            await adminCall(superadmin, REMOVE, { c: target.counterpartyId, a: member });
        expect(teamRows(target.counterpartyId), 'the team is restored').toEqual(before);
    });

    test('the team is read exactly by the actors who see the client', async () => {
        const proof = await counterpartyField<Team>(superadmin, TEAM, target.counterpartyId);
        expect(proof.value!.teamMembers.map(m => m.administratorId)).toContain(member);
        for (const actor of ACTORS) {
            if (!actorCredentials(actor.key)) continue;
            const shown = expectedIds(actor, actorState(actor)).has(target.counterpartyId);
            if (actor.key === 'manager-a') expect(shown, 'the team grants manager-a').toBe(true);
            if (actor.key === 'head-a') expect(shown).toBe(false);
            const got = await counterpartyField<Team>(
                await actorToken(actor.key),
                TEAM,
                target.counterpartyId,
            );
            expect(got.errors, actor.key).toEqual([]);
            if (shown)
                expect(got.value!.teamMembers, actor.key).toContainEqual({
                    administratorId: member,
                    role: 'observer',
                });
            else expect(got.value, `${actor.key}: hidden`).toBeNull();
        }
    });

    test('a team member also reads the client portal customer, an outsider does not', async () => {
        const id = target.customerIds[0];
        const read = async (key: ActorKey): Promise<string | null> => {
            const r = await adminCall(await actorToken(key), CUSTOMER, { id });
            return (r.data as { customer: { id: string } | null }).customer?.id ?? null;
        };
        expect(await read('manager-a')).toBe(id);
        expect(await read('head-a')).toBeNull();
    });

    test('an out-of-scope head cannot add or remove members of a hidden client', async () => {
        const head = adminOf('head-a');
        expect(hasPermission(head, 'ManageCounterpartyTeam'), 'head-a may manage teams').toBe(true);
        const token = await actorToken('head-a');
        const rows = teamRows(target.counterpartyId);
        const add = await adminCall(token, ADD, { c: target.counterpartyId, a: head });
        expect(add.errors.join(' ')).toMatch(DENIED);
        const remove = await adminCall(token, REMOVE, { c: target.counterpartyId, a: member });
        expect(remove.errors.join(' ')).toMatch(DENIED);
        expect(teamRows(target.counterpartyId), 'no team row changed').toEqual(rows);
    });

    test('the team tab shows the member in scope and the client is not found out of scope', async ({
        browser,
    }, testInfo) => {
        const path = `/customers/${target.counterpartyId}?tab=team`;
        for (const [key, shown] of [
            ['head-b', true],
            ['head-a', false],
        ] as [ActorKey, boolean][]) {
            const { context, page, log } = await openManagerAs(browser, key);
            try {
                await visit(page, log, path);
                // The page shell renders before the client lookup answers, so wait for the outcome itself.
                const notFound = page.getByText('Customer not found');
                if (shown) {
                    await expect(page.getByText('Observer', { exact: true }).first()).toBeVisible();
                    await expect(
                        page.getByText('Primary manager', { exact: true }).last(),
                    ).toBeVisible();
                    await expect(notFound).toHaveCount(0);
                } else await expect(notFound).toBeVisible();
                const name = `${SHOTS}-team-tab-${key}.png`;
                await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
            } finally {
                await context.close();
            }
        }
    });

    test('an in-scope head removes the member and the client leaves manager-a again', async () => {
        const removed = await adminCall(await actorToken('head-b'), REMOVE, {
            c: target.counterpartyId,
            a: member,
        });
        expect(removed.errors).toEqual([]);
        expect(teamRows(target.counterpartyId)).toEqual(before);
        expect(expectedIds(ACTORS[0], actorState(ACTORS[0])).has(target.counterpartyId)).toBe(
            false,
        );
        const got = await counterpartyField<Team>(
            await actorToken('manager-a'),
            TEAM,
            target.counterpartyId,
        );
        expect(got.value).toBeNull();
    });
});
