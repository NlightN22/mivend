import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropTestSchema } from 'shared';

import { SettlementDocument } from '../../entities/settlement-document.entity';
import { createHarness, ctx, documentInput } from './settlement-harness';
import type { Harness } from './settlement-harness';

let h: Harness;

beforeAll(async () => {
    h = await createHarness('settlement_retention');
});

afterAll(async () => {
    await h.dataSource.destroy();
    await dropTestSchema(h.schema);
});

beforeEach(async () => {
    await h.dataSource.query(
        'TRUNCATE settlement_document, settlement_balance, "order", payment_attempt RESTART IDENTITY CASCADE',
    );
    await h.balances.apply(ctx, {
        key: 'org-1:cp-1:ct-1',
        version: '1',
        isDeleted: false,
        organizationErpId: 'org-1',
        counterpartyErpId: 'cp-1',
        contractErpId: 'ct-1',
        currency: 'RUB',
        openingDate: new Date('2026-06-15T00:00:00Z'),
        openingBalance: 0,
        closingBalance: 10,
    });
});

const OLD = new Date('2025-06-14T00:00:00Z');
const INSIDE = new Date('2025-06-16T00:00:00Z');
const erpIds = async (): Promise<string[]> =>
    (await h.dataSource.getRepository(SettlementDocument).find({ order: { erpId: 'ASC' } })).map(
        d => d.erpId,
    );

describe('SettlementRetentionService (real Postgres)', () => {
    it('removes only documents before the window start minus the period', async () => {
        await h.documents.apply(ctx, documentInput('old', { date: OLD }));
        await h.documents.apply(ctx, documentInput('inside', { date: INSIDE }));

        expect(await h.retention.sweep(ctx)).toBe(1);

        expect(await erpIds()).toEqual(['inside']);
    });

    it('is idempotent: a second run removes nothing', async () => {
        await h.documents.apply(ctx, documentInput('old', { date: OLD }));
        await h.retention.sweep(ctx);

        expect(await h.retention.sweep(ctx)).toBe(0);
    });

    it('never removes a mivend-owned document', async () => {
        await h.documents.apply(ctx, documentInput('old', { date: OLD }));
        await h.dataSource.query(`UPDATE settlement_document SET "isErpOwned" = false`);

        expect(await h.retention.sweep(ctx)).toBe(0);
    });

    it('keeps a document whose triple has no balance fact', async () => {
        const base = documentInput('x').entries[0];
        await h.documents.apply(
            ctx,
            documentInput('no-balance', {
                date: OLD,
                entries: [{ ...base, contractErpId: 'other' }],
            }),
        );

        expect(await h.retention.sweep(ctx)).toBe(0);
    });

    it('keeps a document if any one of its triples is still inside the window', async () => {
        const base = documentInput('x').entries[0];
        await h.balances.apply(ctx, {
            key: 'org-1:cp-1:ct-2',
            version: '1',
            isDeleted: false,
            organizationErpId: 'org-1',
            counterpartyErpId: 'cp-1',
            contractErpId: 'ct-2',
            currency: 'RUB',
            openingDate: new Date('2025-01-01T00:00:00Z'),
            openingBalance: 0,
            closingBalance: 1,
        });
        await h.documents.apply(
            ctx,
            documentInput('multi', {
                date: OLD,
                entries: [base, { ...base, contractErpId: 'ct-2' }],
            }),
        );

        expect(await h.retention.sweep(ctx)).toBe(0);
    });

    it('keeps a document linked to an order or payment still open, removes it once closed', async () => {
        await h.dataSource.query(
            `INSERT INTO "order" (state, "customFieldsErporderid") VALUES ('PaymentAuthorized', 'o-1')`,
        );
        const base = documentInput('x').entries[0];
        await h.documents.apply(
            ctx,
            documentInput('linked', {
                date: OLD,
                entries: [
                    { ...base, orderLinks: [{ orderErpId: 'o-1', orderUuid: null, amount: 1 }] },
                ],
            }),
        );
        expect(await h.retention.sweep(ctx)).toBe(0);

        await h.dataSource.query(`UPDATE "order" SET state = 'Delivered'`);
        await h.dataSource.query(
            `INSERT INTO payment_attempt ("orderId", "paymentStatus") VALUES (1, 'pending')`,
        );
        expect(await h.retention.sweep(ctx)).toBe(0);

        await h.dataSource.query(`UPDATE payment_attempt SET "paymentStatus" = 'captured'`);
        expect(await h.retention.sweep(ctx)).toBe(1);
    });

    it('a document re-sent concurrently with the sweep is re-created, not lost', async () => {
        await h.documents.apply(ctx, documentInput('old', { date: OLD }));

        await Promise.all([
            h.retention.sweep(ctx),
            h.documents.apply(
                ctx,
                documentInput('old', { date: OLD, version: '2026-10-05T00:00:00Z' }),
            ),
        ]);
        await h.documents.apply(
            ctx,
            documentInput('old', { date: OLD, version: '2026-10-06T00:00:00Z' }),
        );

        expect(await erpIds()).toEqual(['old']);
    });
});
