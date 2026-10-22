import { beforeAll, describe, expect, it } from 'vitest';

import { admin, seed, staff, staffToken } from '../harness/actors';
import {
    BRANCH_TEAMS,
    STAFF,
    TEAM_OBSERVER,
    VISIBLE_COUNTERPARTIES,
    type ActorKey,
} from '../seed/fixture-plan';
import {
    ADD,
    HIDDEN_WRITE,
    REMOVE,
    TEAM,
    counterpartyField,
    customerById,
    linkedCustomers,
} from '../customer/portal-customer-queries';
import { visibleById } from './counterparty-queries';

type Team = { teamMembers: { administratorId: string; role: string }[] };

const target = TEAM_OBSERVER.counterparty;
const member = (): string => seed().admins[TEAM_OBSERVER.actor];

async function team(token: string): Promise<{ value: Team | null; errors: string[] }> {
    return counterpartyField<Team>(token, TEAM, target);
}

async function memberIds(): Promise<string[]> {
    const got = await team(await staffToken('superadmin'));
    return got.value!.teamMembers.map(m => m.administratorId).sort();
}

describe('a counterparty team follows the counterparty', () => {
    let before: string[];

    beforeAll(async () => {
        before = await memberIds();
        expect(before, 'the seeded observer is on the team').toContain(member());
    });

    it('the team is read exactly by the actors who see the client', async () => {
        expect(VISIBLE_COUNTERPARTIES[TEAM_OBSERVER.actor]).toContain(target);
        expect(VISIBLE_COUNTERPARTIES['head-a']).not.toContain(target);
        for (const key of STAFF.map(s => s.key)) {
            const got = await team(await staffToken(key));
            expect(got.errors, key).toEqual([]);
            if (VISIBLE_COUNTERPARTIES[key].includes(target))
                expect(got.value!.teamMembers, key).toContainEqual({
                    administratorId: member(),
                    role: 'observer',
                });
            else expect(got.value, `${key}: hidden`).toBeNull();
        }
    });

    it('a team member also reads the client portal customer, an outsider does not', async () => {
        const [id] = await linkedCustomers(target);
        expect(id, 'the team client has a portal customer').toBeTruthy();
        expect(await customerById(await staffToken(TEAM_OBSERVER.actor), id)).toBe(id);
        expect(await customerById(await staffToken('head-a'), id)).toBeNull();
    });

    it('an out-of-scope head cannot add or remove members of a hidden client', async () => {
        const roles = await admin<{
            administrator: { user: { roles: { permissions: string[] }[] } };
        }>(
            await staffToken('superadmin'),
            `query($id: ID!) { administrator(id: $id) { user { roles { permissions } } } }`,
            { id: seed().admins['head-a'] },
        );
        const permissions = roles.data!.administrator.user.roles.flatMap(r => r.permissions);
        expect(permissions, 'head-a may manage teams').toContain('ManageCounterpartyTeam');
        const token = await staffToken('head-a');
        const add = await admin(token, ADD, {
            c: seed().counterparties[target],
            a: seed().admins['head-a'],
        });
        expect(add.errors.join(' ')).toMatch(HIDDEN_WRITE);
        const remove = await admin(token, REMOVE, {
            c: seed().counterparties[target],
            a: member(),
        });
        expect(remove.errors.join(' ')).toMatch(HIDDEN_WRITE);
        expect(await memberIds(), 'no team row changed').toEqual(before);
    });

    it('an in-scope head removes the member and the client leaves that manager, then it is restored', async () => {
        const superadmin = await staffToken('superadmin');
        const observer = await staffToken(TEAM_OBSERVER.actor as ActorKey);
        try {
            const removed = await admin(await staffToken('head-b'), REMOVE, {
                c: seed().counterparties[target],
                a: member(),
            });
            expect(removed.errors).toEqual([]);
            expect(await memberIds()).not.toContain(member());
            expect((await team(observer)).value).toBeNull();
            expect(await visibleById(observer, target)).toBe(false);
        } finally {
            if (!(await memberIds()).includes(member()))
                await admin(superadmin, ADD, { c: seed().counterparties[target], a: member() });
        }
        expect(await memberIds(), 'the team is restored').toEqual(before);
        expect(await visibleById(observer, target)).toBe(true);
    });
});

describe.each(STAFF.map(s => s.key))('teams for %s', (key: ActorKey) => {
    it('reads every seeded team exactly when it sees the client; a scoped actor misses one', async () => {
        const token = await staffToken(key);
        const superadmin = await staffToken('superadmin');
        const teams = [TEAM_OBSERVER, ...BRANCH_TEAMS];
        let hidden = 0;
        for (const t of teams) {
            const proof = await counterpartyField<Team>(superadmin, TEAM, t.counterparty);
            const ids = proof.value!.teamMembers.map(m => m.administratorId);
            expect(ids, `${t.counterparty} team`).toContain(seed().admins[t.actor]);
            const got = await counterpartyField<Team>(token, TEAM, t.counterparty);
            expect(got.errors).toEqual([]);
            if (VISIBLE_COUNTERPARTIES[key].includes(t.counterparty))
                expect(got.value, t.counterparty).toEqual(proof.value);
            else {
                expect(got.value, `${t.counterparty}: hidden`).toBeNull();
                hidden++;
            }
        }
        if (staff(key).scope === 'all') expect(hidden).toBe(0);
        else expect(hidden, 'a hidden team').toBeGreaterThan(0);
    });
});
