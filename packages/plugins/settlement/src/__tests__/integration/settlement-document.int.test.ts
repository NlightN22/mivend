import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropTestSchema } from 'shared';

import { SettlementDocumentEntry } from '../../entities/settlement-document-entry.entity';
import { SettlementDocument } from '../../entities/settlement-document.entity';
import { SettlementOrderLink } from '../../entities/settlement-order-link.entity';
import { createHarness, ctx, documentInput } from './settlement-harness';
import type { Harness } from './settlement-harness';

let h: Harness;

beforeAll(async () => {
    h = await createHarness('settlement_document');
});

afterAll(async () => {
    await h.dataSource.destroy();
    await dropTestSchema(h.schema);
});

beforeEach(async () => {
    await h.dataSource.query(
        'TRUNCATE settlement_document, settlement_document_entry, settlement_order_link, "order" RESTART IDENTITY CASCADE',
    );
    h.counterparties.clear();
    h.contracts.clear();
});

const docs = (): Promise<SettlementDocument[]> =>
    h.dataSource.getRepository(SettlementDocument).find();
const entries = (): Promise<SettlementDocumentEntry[]> =>
    h.dataSource.getRepository(SettlementDocumentEntry).find({ order: { id: 'ASC' } });

describe('SettlementDocumentService (real Postgres)', () => {
    it('stores amounts as integer minor units rounded from major units', async () => {
        await h.documents.apply(ctx, documentInput('d1'));

        expect((await entries())[0].amountMinor).toBe(10050);
    });

    it('concurrent delivery of the same document uuid yields one row and one entry set', async () => {
        const results = await Promise.all(
            Array.from({ length: 8 }, () => h.documents.apply(ctx, documentInput('d1'))),
        );

        expect(results.filter(r => r === 'applied')).toHaveLength(1);
        expect(await docs()).toHaveLength(1);
        expect(await entries()).toHaveLength(1);
    });

    it('concurrent different versions converge on the newest regardless of arrival order', async () => {
        const versions = ['2026-10-01T10:00:03Z', '2026-10-01T10:00:01Z', '2026-10-01T10:00:02Z'];

        await Promise.all(
            versions.map((version, i) =>
                h.documents.apply(
                    ctx,
                    documentInput('d1', {
                        version,
                        entries: [{ ...documentInput('d1').entries[0], amount: i + 1 }],
                    }),
                ),
            ),
        );

        const [doc] = await docs();
        expect(doc.sourceVersion).toBe('2026-10-01T10:00:03Z');
        expect((await entries()).map(e => e.amountMinor)).toEqual([100]);
    });

    it('a re-sent version replaces the whole entries and order links', async () => {
        const base = documentInput('d1').entries[0];
        await h.documents.apply(
            ctx,
            documentInput('d1', {
                entries: [
                    { ...base, orderLinks: [{ orderErpId: 'o-1', orderUuid: null, amount: 50 }] },
                    { ...base, contractErpId: 'ct-2' },
                ],
            }),
        );
        expect(await entries()).toHaveLength(2);
        expect(await h.dataSource.getRepository(SettlementOrderLink).count()).toBe(1);

        await h.documents.apply(
            ctx,
            documentInput('d1', {
                version: '2026-10-02T10:00:00Z',
                entries: [{ ...base, amount: 5 }],
            }),
        );

        const rows = await entries();
        expect(rows.map(r => r.amountMinor)).toEqual([500]);
        expect(await h.dataSource.getRepository(SettlementOrderLink).count()).toBe(0);
    });

    it('isDeleted voids the document; a stale version cannot revive it, a newer one re-creates it', async () => {
        await h.documents.apply(ctx, documentInput('d1'));
        await h.documents.apply(
            ctx,
            documentInput('d1', { version: '2026-10-02T10:00:00Z', isDeleted: true, entries: [] }),
        );
        expect((await docs())[0].isDeleted).toBe(true);

        expect(await h.documents.apply(ctx, documentInput('d1'))).toBe('stale');
        expect((await docs())[0].isDeleted).toBe(true);

        await h.documents.apply(ctx, documentInput('d1', { version: '2026-10-03T10:00:00Z' }));
        expect((await docs())[0].isDeleted).toBe(false);
    });

    it('a live re-send with an empty entries array replaces the entries with none and keeps the document', async () => {
        await h.documents.apply(ctx, documentInput('d1'));

        const result = await h.documents.apply(
            ctx,
            documentInput('d1', { version: '2026-10-02T10:00:00Z', entries: [] }),
        );

        expect(result).toBe('applied');
        expect(await docs()).toHaveLength(1);
        expect(await entries()).toHaveLength(0);
    });

    it('a deletion of an unknown uuid is a harmless no-op', async () => {
        const result = await h.documents.apply(
            ctx,
            documentInput('ghost', { isDeleted: true, entries: [] }),
        );

        expect(result).toBe('unknown-deleted');
        expect(await docs()).toHaveLength(0);
    });

    it('accepts an unknown document type without any code change and keeps the number non-unique', async () => {
        await h.documents.apply(ctx, documentInput('d1', { documentType: 'NewKind', number: '9' }));
        await h.documents.apply(ctx, documentInput('d2', { documentType: 'NewKind', number: '9' }));

        expect(await docs()).toHaveLength(2);
    });

    it('keeps entries of different counterparties separated by resolved local id', async () => {
        h.counterparties.set('cp-a', 11);
        h.counterparties.set('cp-b', 22);
        const base = documentInput('d1').entries[0];
        await h.documents.apply(
            ctx,
            documentInput('d1', {
                entries: [
                    { ...base, counterpartyErpId: 'cp-a' },
                    { ...base, counterpartyErpId: 'cp-b' },
                ],
            }),
        );

        const forA = await h.dataSource
            .getRepository(SettlementDocumentEntry)
            .find({ where: { counterpartyId: '11' } });
        expect(forA).toHaveLength(1);
        expect(forA[0].counterpartyErpId).toBe('cp-a');
    });

    it('keeps an entry pending until the contract arrives, then attaches it', async () => {
        h.counterparties.set('cp-1', 5);
        await h.documents.apply(ctx, documentInput('d1'));
        expect((await entries())[0]).toMatchObject({ counterpartyId: '5', contractId: null });

        await h.pending.attachContract(ctx, 'ct-1', '77');

        expect((await entries())[0].contractId).toBe('77');
    });

    it('an attach racing the write is never lost (same lock as the write)', async () => {
        h.lookupDelayMs.value = 60;
        const apply = h.documents.apply(ctx, documentInput('d1'));
        await new Promise(resolve => setTimeout(resolve, 20));
        h.counterparties.set('cp-1', 5);
        const attach = h.pending.attachCounterparty(ctx, 'cp-1', '5');
        await Promise.all([apply, attach]);
        h.lookupDelayMs.value = 0;

        expect((await entries())[0].counterpartyId).toBe('5');
    });

    it('links an order link by erpOrderId at write time and by uuid when the order arrives later', async () => {
        await h.dataSource.query(
            `INSERT INTO "order" (state, "customFieldsErporderid") VALUES ('PaymentAuthorized', 'o-known')`,
        );
        const base = documentInput('d1').entries[0];
        await h.documents.apply(
            ctx,
            documentInput('d1', {
                entries: [
                    {
                        ...base,
                        orderLinks: [
                            { orderErpId: 'o-known', orderUuid: null, amount: 10 },
                            { orderErpId: 'o-late', orderUuid: 'uuid-late', amount: 20 },
                        ],
                    },
                ],
            }),
        );
        const links = (): Promise<SettlementOrderLink[]> =>
            h.dataSource.getRepository(SettlementOrderLink).find({ order: { id: 'ASC' } });
        expect((await links()).map(l => l.orderId)).toEqual([1, null]);

        await h.dataSource.query(
            `INSERT INTO "order" (state, "customFieldsErporderid", "customFieldsUuid")
             VALUES ('PaymentAuthorized', 'o-late', 'uuid-late')`,
        );
        await h.pending.attachOrder(ctx, 'o-late');

        expect((await links()).map(l => l.orderId)).toEqual([1, 2]);
    });
});
