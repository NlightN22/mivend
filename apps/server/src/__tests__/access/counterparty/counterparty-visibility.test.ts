import { beforeAll, describe, expect, it } from 'vitest';

import { admin, seed, staff, staffToken } from '../harness/actors';
import {
    STAFF,
    VISIBLE_COUNTERPARTIES,
    counterpartyName,
    type ActorKey,
} from '../seed/fixture-plan';
import {
    ALL_KEYS,
    PORTAL_STATES,
    SUMMARY,
    idOf,
    listed,
    listedByPortalState,
    visibleById,
    visibleCounterpartyIds,
} from './counterparty-queries';

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
        const ids = visibleCounterpartyIds(key);
        const page = await listed(token);
        expect(page.total).toBe(ids.length);
        expect(new Set(page.ids)).toEqual(new Set(ids));
        const summary = await admin<{ counterpartySummary: { totalCount: number } }>(
            token,
            SUMMARY,
        );
        expect(summary.errors).toEqual([]);
        expect(summary.data!.counterpartySummary.totalCount).toBe(ids.length);
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

    it('the portal state filter and its counts never reach beyond the scope (#375)', async () => {
        const ids = new Set(visibleCounterpartyIds(key));
        const everyState = await listedByPortalState(token, PORTAL_STATES);
        expect(everyState.total).toBe(ids.size);
        expect(new Set(everyState.rows.map(r => r.id))).toEqual(ids);
        expect(everyState.rows.every(r => PORTAL_STATES.some(s => s === r.portalState))).toBe(true);
        let counted = 0;
        for (const state of PORTAL_STATES) {
            const part = await listedByPortalState(token, [state]);
            expect(
                part.rows.every(r => ids.has(r.id)),
                `${state} stays in scope`,
            ).toBe(true);
            counted += part.total;
        }
        expect(counted).toBe(ids.size);
    });
});
