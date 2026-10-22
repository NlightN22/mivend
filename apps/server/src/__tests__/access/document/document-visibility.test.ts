import { beforeAll, describe, expect, it } from 'vitest';

import { admin, customerToken, seed, shop, staff, staffToken } from '../harness/actors';
import {
    CUSTOMERS,
    ORDERS,
    STAFF,
    VISIBLE_COUNTERPARTIES,
    type ActorKey,
    type CustomerKey,
} from '../seed/fixture-plan';
import { TYPES, documents, download, samples, type SampleDocument } from './document-queries';

const MY_DOCS = `query($search: String) { myDocuments(options: { take: 200, search: $search }) { totalItems items { id } } }`;
type MyDocs = { myDocuments: { totalItems: number; items: { id: string }[] } };

let all: SampleDocument[];

beforeAll(async () => {
    all = await samples();
});

describe('documents for the superadmin', () => {
    it('every sample document is found by number and its PDF downloads', async () => {
        const superadmin = await staffToken('superadmin');
        for (const s of all) {
            const found = await documents(superadmin, { search: s.number });
            expect(found.items.map(i => i.id)).toContain(s.id);
            const file = await download(s.pdfUrl, superadmin);
            expect(file.status, `PDF of ${s.number}`).toBe(200);
            expect(file.type).toBe('application/pdf');
            expect(file.disposition).toBe(`attachment; filename="${s.number}.pdf"`);
            expect(file.body.subarray(0, 5).toString()).toBe('%PDF-');
        }
    });

    it('a rendered PDF never becomes a public asset', async () => {
        const superadmin = await staffToken('superadmin');
        for (const s of all) {
            const uuid = s.pdfUrl.split('/').pop()!;
            for (const name of [uuid, s.number]) {
                const assets = await admin<{ assets: { totalItems: number } }>(
                    superadmin,
                    `query($n: String!) { assets(options: { filter: { name: { contains: $n } } }) { totalItems } }`,
                    { n: name },
                );
                expect(assets.errors).toEqual([]);
                expect(assets.data!.assets.totalItems, `asset named ${name}`).toBe(0);
            }
        }
    });
});

describe.each(STAFF.map(s => s.key))('documents for %s', (key: ActorKey) => {
    const visible = new Set(VISIBLE_COUNTERPARTIES[key]);

    it('list, search, types and PDF follow the counterparty scope', async () => {
        const token = await staffToken(key);
        const expected = all
            .filter(s => visible.has(s.counterparty))
            .reduce((n, s) => n + s.total, 0);
        const page = await documents(token);
        if (staff(key).scope === 'all')
            expect(page.totalItems).toBe(
                (await documents(await staffToken('superadmin'))).totalItems,
            );
        else expect(page.totalItems).toBe(expected);
        if (staff(key).scope !== 'all')
            expect(
                all.some(s => !visible.has(s.counterparty)),
                'a hidden document',
            ).toBe(true);
        for (const s of all) {
            const shown = visible.has(s.counterparty);
            const cp = seed().counterparties[s.counterparty];
            const own = await documents(token, { cp });
            expect(own.totalItems, `documents of ${s.counterparty}`).toBe(shown ? s.total : 0);
            const found = await documents(token, { search: s.number });
            expect(
                found.items.some(i => i.id === s.id),
                `search ${s.number}`,
            ).toBe(shown);
            const types = await admin<{ documentTypes: string[] }>(token, TYPES, {
                cp,
            });
            expect(types.errors).toEqual([]);
            expect(types.data!.documentTypes.length > 0, `types of ${s.counterparty}`).toBe(shown);
            expect((await download(s.pdfUrl, token)).status, `PDF of ${s.counterparty}`).toBe(
                shown ? 200 : 404,
            );
        }
    });

    it('documents filtered by an order follow the counterparty scope', async () => {
        const token = await staffToken(key);
        const superadmin = await staffToken('superadmin');
        for (const o of ORDERS.filter(p => p.proformas !== 'none')) {
            const order = { order: seed().ordering.orders[o.key].id };
            const proof = await documents(superadmin, order);
            expect(proof.totalItems, `documents of order ${o.key}`).toBeGreaterThan(0);
            const got = await documents(token, order);
            expect(got.totalItems, `documents of order ${o.key}`).toBe(
                visible.has(o.counterparty) ? proof.totalItems : 0,
            );
        }
    });
});

describe.each(CUSTOMERS.map(c => c.key))(
    'documents of %s in the storefront',
    (key: CustomerKey) => {
        const mine = CUSTOMERS.find(c => c.key === key)!.counterparty;

        it('sees only its own documents and cannot find another one by number', async () => {
            const token = await customerToken(key);
            const own = await shop<MyDocs>(token, MY_DOCS);
            expect(own.errors).toEqual([]);
            expect(own.data!.myDocuments.totalItems).toBe(
                all.find(s => s.counterparty === mine)!.total,
            );
            for (const s of all.filter(d => d.counterparty !== mine)) {
                const found = await shop<MyDocs>(token, MY_DOCS, { search: s.number });
                expect(found.data!.myDocuments.items.map(i => i.id)).not.toContain(s.id);
            }
        });

        it('downloads its own PDF and gets 404 for every other counterparty', async () => {
            const token = await customerToken(key);
            for (const s of all)
                expect((await download(s.pdfUrl, token)).status, s.counterparty).toBe(
                    s.counterparty === mine ? 200 : 404,
                );
        });
    },
);

it('a guest gets no documents and no PDF', async () => {
    const docs = await shop<MyDocs>('', MY_DOCS);
    expect(docs.data?.myDocuments?.items ?? []).toEqual([]);
    for (const s of all) expect((await download(s.pdfUrl)).status, s.counterparty).toBe(404);
});
