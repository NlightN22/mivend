import { expect, it } from 'vitest';

import { admin, staffToken } from '../harness/actors';
import { SETUPS, VISIBLE_SETUPS, setupNumber, type SetupKey } from '../seed/discount-setup-seed';
import { counterpartyName, type ActorKey } from '../seed/fixture-plan';

const LIST = `{ discountSetups(options: { take: 100, search: "91" }) { totalItems items {
    documentNumber percent status recipientCount counterparties { name } } } }`;
const COUNTS = `{ discountSetupCounts { all inactive } }`;
const KEYS = Object.keys(SETUPS) as SetupKey[];
const ACTORS = Object.keys(VISIBLE_SETUPS) as ActorKey[];

type Row = {
    documentNumber: string;
    percent: number;
    status: string;
    recipientCount: number;
    counterparties: { name: string }[];
};

async function list(actor: ActorKey): Promise<Row[]> {
    const res = await admin<{ discountSetups: { totalItems: number; items: Row[] } }>(
        await staffToken(actor),
        LIST,
    );
    expect(res.errors).toEqual([]);
    expect(res.data!.discountSetups.totalItems).toBe(res.data!.discountSetups.items.length);
    return res.data!.discountSetups.items;
}

for (const actor of ACTORS) {
    it(`${actor} sees exactly the ERP discounts of its scope and the ones for everyone`, async () => {
        const numbers = (await list(actor)).map(r => r.documentNumber).sort();
        expect(numbers).toEqual(VISIBLE_SETUPS[actor].map(setupNumber).sort());
    });

    it(`${actor}: the counts match the list and no name outside the scope is returned`, async () => {
        const rows = await list(actor);
        const counts = await admin<{ discountSetupCounts: { all: number; inactive: number } }>(
            await staffToken(actor),
            COUNTS,
        );
        expect(counts.data!.discountSetupCounts.all).toBe(rows.length);
        expect(counts.data!.discountSetupCounts.inactive).toBe(
            rows.filter(r => r.status === 'inactive').length,
        );
        const own = KEYS.filter(k => VISIBLE_SETUPS[actor].includes(k));
        for (const key of own) {
            const row = rows.find(r => r.documentNumber === setupNumber(key))!;
            const named = SETUPS[key].recipients.filter(Boolean).length;
            expect(row.recipientCount, `${key} recipientCount`).toBe(named);
            expect(row.counterparties.length).toBeLessThanOrEqual(named);
        }
        if (actor === 'manager-a') {
            const wide = rows.find(r => r.documentNumber === setupNumber('wide'))!;
            expect(wide.counterparties.map(c => c.name)).toEqual([counterpartyName('a-own')]);
            expect(wide.recipientCount).toBe(2);
            expect(JSON.stringify(rows)).not.toContain(counterpartyName('b-own'));
        }
    });
}

it('the director sees a negative-percent markup and a cancelled setup as inactive', async () => {
    const rows = await list('director');
    expect(rows.find(r => r.documentNumber === setupNumber('everyone-empty'))!.percent).toBe(-4);
    expect(rows.find(r => r.documentNumber === setupNumber('inactive-a'))!.status).toBe('inactive');
});
