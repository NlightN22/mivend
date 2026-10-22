import { beforeAll, describe, expect, it } from 'vitest';

import { admin, seed, staff, staffToken } from '../harness/actors';
import {
    STAFF,
    VISIBLE_COUNTERPARTIES,
    counterpartyName,
    type ActorKey,
} from '../seed/fixture-plan';
import { ALL_KEYS, SUMMARY, idOf, listed, visibleById } from './counterparty-queries';

const ADMIN_STATE = `query($id: ID!) { administrator(id: $id) { customFields { branchId } user { roles { code } } } }`;

describe.each(STAFF.map(s => s.key))('counterparty visibility for %s', (key: ActorKey) => {
    let token: string;
    let superadmin: string;
    const expected = new Set(VISIBLE_COUNTERPARTIES[key]);

    beforeAll(async () => {
        token = await staffToken(key);
        superadmin = await staffToken('superadmin');
    });

    it('has the role and branch the scenario assumes', async () => {
        const result = await admin<{
            administrator: {
                customFields: { branchId: string | null };
                user: { roles: { code: string }[] };
            };
        }>(superadmin, ADMIN_STATE, { id: seed().admins[key] });
        const state = result.data!.administrator;
        expect(state.user.roles.map(r => r.code)).toContain(staff(key).role);
        const branch = staff(key).department.endsWith('-a')
            ? seed().branches.a
            : staff(key).department.endsWith('-b')
              ? seed().branches.b
              : staff(key).department.endsWith('-default')
                ? seed().branches.default
                : null;
        expect(state.customFields.branchId).toBe(branch);
    });

    it('list total and summary count equal the rows the scope allows, nothing more', async () => {
        const page = await listed(token);
        expect(page.total).toBe(expected.size);
        expect(new Set(page.ids)).toEqual(new Set([...expected].map(idOf)));
        const summary = await admin<{ counterpartySummary: { totalCount: number } }>(
            token,
            SUMMARY,
        );
        expect(summary.errors).toEqual([]);
        expect(summary.data!.counterpartySummary.totalCount).toBe(expected.size);
    });

    it('every counterparty is visible by id and by search exactly when the scope allows it', async () => {
        if (staff(key).scope !== 'all')
            expect(
                ALL_KEYS.some(k => !expected.has(k)),
                'a hidden row exists',
            ).toBe(true);
        for (const cp of ALL_KEYS) {
            const shown = expected.has(cp);
            expect(await visibleById(token, cp), `${cp} by id`).toBe(shown);
            const found = await listed(token, counterpartyName(cp));
            expect(found.ids.includes(idOf(cp)), `${cp} by search`).toBe(shown);
            if (!shown) expect(await visibleById(superadmin, cp), `${cp} exists`).toBe(true);
        }
    });
});
