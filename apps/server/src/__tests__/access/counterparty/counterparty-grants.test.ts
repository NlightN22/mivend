import { describe, expect, it } from 'vitest';

import { admin, seed, staffToken } from '../harness/actors';
import type { CounterpartyKey } from '../seed/fixture-plan';
import { listed, visibleById, visibleCounterpartyIds } from './counterparty-queries';

const GRANT = `mutation($g: ID!, $m: ID!, $t: DateTime, $r: String!) { grantManagerVisibility(granteeAdministratorId: $g, managerAdministratorId: $m, validTo: $t, reason: $r) { id } }`;
const REVOKE = `mutation($i: ID!) { revokeVisibilityGrant(id: $i, reason: "access test restore") { id } }`;
const GRANTS = `query { visibilityGrants(take: 100) { totalItems } }`;
const REFUSED = /not currently authorized|not allowed|cannot|forbidden/i;

const tomorrow = (): string => new Date(Date.now() + 24 * 3600 * 1000).toISOString();

async function grantCount(): Promise<number> {
    const result = await admin<{ visibilityGrants: { totalItems: number } }>(
        await staffToken('superadmin'),
        GRANTS,
    );
    expect(result.errors).toEqual([]);
    return result.data!.visibilityGrants.totalItems;
}

describe('visibility grants', () => {
    it("a grant lets head-b see manager-a's clients of another branch, and revoking takes it away", async () => {
        const superadmin = await staffToken('superadmin');
        const [head, headA] = [await staffToken('head-b'), await staffToken('head-a')];
        const before = visibleCounterpartyIds('head-b');
        const hidden: CounterpartyKey[] = ['a-own', 'a-point'];
        for (const cp of hidden) expect(await visibleById(head, cp)).toBe(false);
        expect((await listed(head)).total).toBe(before.length);

        const granted = await admin<{ grantManagerVisibility: { id: string } }>(superadmin, GRANT, {
            g: seed().admins['head-b'],
            m: seed().admins['manager-a'],
            t: tomorrow(),
            r: 'access test grant',
        });
        expect(granted.errors).toEqual([]);
        try {
            for (const cp of hidden)
                expect(await visibleById(head, cp), `${cp} is visible under the grant`).toBe(true);
            expect((await listed(head)).total, 'the total follows the union').toBe(
                before.length + hidden.length,
            );
            expect((await listed(headA)).total, 'another head is not affected').toBe(
                visibleCounterpartyIds('head-a').length,
            );
        } finally {
            await admin(superadmin, REVOKE, { i: granted.data!.grantManagerVisibility.id });
        }
        for (const cp of hidden)
            expect(await visibleById(head, cp), 'hidden after revoke').toBe(false);
        expect((await listed(head)).total).toBe(before.length);
    });

    it('a head with only the grant permission cannot grant to themselves or outside the team; nothing is written', async () => {
        const head = await staffToken('head-b');
        const rows = await grantCount();
        for (const grantee of [seed().admins['head-b'], seed().admins['operator-a']]) {
            const attempt = await admin(head, GRANT, {
                g: grantee,
                m: seed().admins['manager-a'],
                t: tomorrow(),
                r: 'must be refused',
            });
            expect(attempt.errors.join()).toMatch(REFUSED);
            expect(attempt.data).toBeNull();
        }
        expect(await grantCount(), 'no grant was written').toBe(rows);
    });
});
