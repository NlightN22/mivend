import { describe, expect, it } from 'vitest';

import { DENIED, admin, seed, staffToken } from '../harness/actors';
import type { GqlResult } from '../harness/graphql';
import { VISIBLE_COUNTERPARTIES, type ActorKey, type CounterpartyKey } from '../seed/fixture-plan';
import { ALL_KEYS, idOf, stateOf, visibleById } from './counterparty-queries';

const REASSIGN = `mutation($c: ID!, $a: ID!) { reassignCounterpartyManager(counterpartyId: $c, administratorId: $a) { id } }`;
const OVERRIDE = `mutation($c: ID!, $b: String) { setCounterpartyBranchOverride(counterpartyId: $c, branchId: $b) }`;

const hiddenFor = (key: ActorKey): CounterpartyKey[] =>
    ALL_KEYS.filter(cp => !VISIBLE_COUNTERPARTIES[key].includes(cp));

async function reassign(
    token: string,
    cp: CounterpartyKey,
    to: string,
): Promise<GqlResult<unknown>> {
    return admin<unknown>(token, REASSIGN, { c: idOf(cp), a: to });
}

describe('counterparty writes', () => {
    it.each(['head-a', 'head-b'] as ActorKey[])(
        '%s is refused outside the branch with nothing written; inside the branch it works',
        async key => {
            const token = await staffToken(key);
            const self = seed().admins[key];
            for (const cp of hiddenFor(key)) {
                const before = await stateOf(cp);
                const attempt = await reassign(token, cp, self);
                expect(attempt.errors.join(), `${cp}: a scope refusal`).toMatch(DENIED);
                expect(attempt.data).toBeNull();
                expect(await stateOf(cp), `${cp}: nothing was written`).toEqual(before);
            }
            const inside = VISIBLE_COUNTERPARTIES[key][0];
            const original = (await stateOf(inside)).assignedManagerId;
            try {
                const ok = await reassign(token, inside, self);
                expect(ok.errors, 'the same mutation works inside the branch').toEqual([]);
                expect((await stateOf(inside)).assignedManagerId).toBe(self);
            } finally {
                const superadmin = await staffToken('superadmin');
                if (original) await reassign(superadmin, inside, original);
            }
            expect((await stateOf(inside)).assignedManagerId).toBe(original);
        },
    );

    it.each(['operator-a', 'manager-a', 'manager-b'] as ActorKey[])(
        '%s has no permission to reassign managers, whatever the counterparty',
        async key => {
            const token = await staffToken(key);
            for (const cp of ['a-own', 'b-own', 'none'] as CounterpartyKey[]) {
                const before = await stateOf(cp);
                const attempt = await reassign(token, cp, seed().admins[key]);
                expect(attempt.errors.join(), cp).toMatch(DENIED);
                expect(await stateOf(cp)).toEqual(before);
            }
        },
    );

    it('a branch override moves a counterparty between the branch views and clearing it moves it back', async () => {
        const superadmin = await staffToken('superadmin');
        const [viewA, viewB] = [await staffToken('head-a'), await staffToken('head-b')];
        const cp: CounterpartyKey = 'b-team';
        expect(await visibleById(viewB, cp)).toBe(true);
        expect(await visibleById(viewA, cp)).toBe(false);
        try {
            const moved = await admin(superadmin, OVERRIDE, { c: idOf(cp), b: seed().branches.a });
            expect(moved.errors).toEqual([]);
            expect(await visibleById(viewA, cp), 'now in the branch-a view').toBe(true);
            expect(await visibleById(viewB, cp), 'gone from the branch-b view').toBe(false);
        } finally {
            await admin(superadmin, OVERRIDE, { c: idOf(cp), b: null });
        }
        expect((await stateOf(cp)).branchId).toBe(seed().branches.b);
        expect(await visibleById(viewB, cp)).toBe(true);
        expect(await visibleById(viewA, cp)).toBe(false);
    });
});
