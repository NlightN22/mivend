import { beforeAll, describe, expect, it } from 'vitest';

import { admin, seed, staff, staffToken } from '../harness/actors';
import {
    GAP_CLIENTS,
    STAFF,
    VISIBLE_COUNTERPARTIES,
    VISIBLE_GAP_BRANCHES,
    gapClientName,
    type ActorKey,
} from '../seed/fixture-plan';

const GAPS = `query($s: String) { priceTypeGapCounterparties(take: 100, search: $s) {
    totalItems items { id shortName reason } } }`;
type Gaps = { totalItems: number; items: { id: string; shortName: string; reason: string }[] };

async function gaps(token: string, s?: string): Promise<Gaps> {
    const result = await admin<{ priceTypeGapCounterparties: Gaps }>(token, GAPS, { s });
    expect(result.errors).toEqual([]);
    return result.data!.priceTypeGapCounterparties;
}

describe.each(STAFF.map(s => s.key))('price type gap list for %s', (key: ActorKey) => {
    let token: string;
    let superadmin: string;
    const plannedGaps = GAP_CLIENTS.filter(c => VISIBLE_GAP_BRANCHES[key].includes(c.branch));
    const hiddenGaps = GAP_CLIENTS.filter(c => !plannedGaps.includes(c));

    beforeAll(async () => {
        token = await staffToken(key);
        superadmin = await staffToken('superadmin');
    });

    it('lists only visible gap clients, in the count, ids and reasons', async () => {
        const visibleIds = new Set(VISIBLE_COUNTERPARTIES[key].map(k => seed().counterparties[k]));
        const all = await gaps(superadmin);
        for (const c of GAP_CLIENTS)
            expect(
                all.items.find(i => i.shortName === gapClientName(c.erpId))?.reason,
                `superadmin sees ${c.erpId}`,
            ).toBe(c.reason);
        const own = await gaps(token);
        const plannedNames = new Set(plannedGaps.map(c => gapClientName(c.erpId)));
        const expected = all.items.filter(
            i => plannedNames.has(i.shortName) || visibleIds.has(i.id),
        );
        expect(own.items.map(i => i.id).sort()).toEqual(expected.map(i => i.id).sort());
        expect(own.totalItems).toBe(expected.length);
        for (const c of plannedGaps)
            expect(
                own.items.find(i => i.shortName === gapClientName(c.erpId))?.reason,
                c.erpId,
            ).toBe(c.reason);
        if (staff(key).scope === 'all') {
            expect(own.items.map(i => i.id).sort()).toEqual(all.items.map(i => i.id).sort());
            expect(all.totalItems, 'the superadmin sees gap clients').toBeGreaterThan(0);
        } else expect(hiddenGaps.length, 'a hidden gap client').toBeGreaterThan(0);
    });

    it('a hidden gap client is not found by search; the superadmin finds it', async () => {
        for (const c of hiddenGaps) {
            const name = gapClientName(c.erpId);
            expect((await gaps(token, name)).items, name).toEqual([]);
            expect((await gaps(superadmin, name)).items.map(i => i.shortName)).toEqual([name]);
        }
        for (const c of plannedGaps) {
            const name = gapClientName(c.erpId);
            expect(
                (await gaps(token, name)).items.map(i => i.shortName),
                name,
            ).toEqual([name]);
        }
    });
});
