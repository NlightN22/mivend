import { expect, test } from '@playwright/test';

import { adminGql } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import {
    VIS_PASSWORD,
    actorEmail,
    clientName,
    type ActorKey,
} from '../../fixtures/visibility/plan';
import { SETUPS, VISIBLE_SETUPS, setupNumber } from '../../fixtures/visibility/setups';
import { superadminToken } from '../session';

const LIST = `{ discountSetups(options: { take: 100, search: "91" }) { totalItems items {
    documentNumber percent status recipientCount counterparties { name } } } }`;

interface Row {
    documentNumber: string;
    percent: number;
    status: string;
    recipientCount: number;
    counterparties: { name: string }[];
}

async function rows(token: string): Promise<Row[]> {
    const { data } = await adminGql<{ discountSetups: { items: Row[] } }>(LIST, undefined, token);
    return data.discountSetups.items;
}

const ALL = VISIBLE_SETUPS.director.map(setupNumber).sort();

test('the superadmin and the director see every ERP discount', async () => {
    expect((await rows(await superadminToken())).map(r => r.documentNumber).sort()).toEqual(ALL);
    const director = await adminTokenFor(actorEmail('director'), VIS_PASSWORD);
    const list = await rows(director);
    expect(list.map(r => r.documentNumber).sort()).toEqual(ALL);
    const markup = list.find(r => r.documentNumber === setupNumber('everyone-empty'))!;
    expect(markup.percent).toBe(-4);
    expect(list.find(r => r.documentNumber === setupNumber('own-b-expired'))!.status).toBe(
        'expired',
    );
    expect(list.find(r => r.documentNumber === setupNumber('own-b-expiring'))!.status).toBe(
        'expiring-soon',
    );
    expect(list.find(r => r.documentNumber === setupNumber('own-a-inactive'))!.status).toBe(
        'inactive',
    );
});

for (const actor of Object.keys(VISIBLE_SETUPS).filter(a => a !== 'director') as ActorKey[]) {
    test(`${actor} sees the ERP discounts of its scope and the ones for everyone`, async () => {
        const list = await rows(await adminTokenFor(actorEmail(actor), VIS_PASSWORD));
        expect(list.map(r => r.documentNumber).sort()).toEqual(
            VISIBLE_SETUPS[actor].map(setupNumber).sort(),
        );
        const wide = list.find(r => r.documentNumber === setupNumber('wide-a-b'))!;
        expect(wide.recipientCount).toBe(SETUPS['wide-a-b'].recipients.length);
        expect(wide.counterparties.length).toBeLessThanOrEqual(2);
    });
}

test('manager-a sees only its own name in the wide setup, never the hidden one', async () => {
    const list = await rows(await adminTokenFor(actorEmail('manager-a'), VIS_PASSWORD));
    const wide = list.find(r => r.documentNumber === setupNumber('wide-a-b'))!;
    expect(wide.counterparties.map(c => c.name)).toEqual([clientName('a-own')]);
    expect(JSON.stringify(list)).not.toContain(clientName('b-own'));
});
