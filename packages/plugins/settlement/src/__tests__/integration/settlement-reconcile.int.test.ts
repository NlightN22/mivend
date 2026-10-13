import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropTestSchema } from 'shared';

import { SettlementDocumentEntry } from '../../entities/settlement-document-entry.entity';
import { SettlementOrderLink } from '../../entities/settlement-order-link.entity';
import { createHarness, ctx, documentInput } from './settlement-harness';
import type { Harness } from './settlement-harness';

let h: Harness;

beforeAll(async () => {
    h = await createHarness('settlement_reconcile');
});

afterAll(async () => {
    await h.dataSource.destroy();
    await dropTestSchema(h.schema);
});

beforeEach(async () => {
    await h.dataSource.query(
        'TRUNCATE settlement_document, settlement_document_entry, settlement_order_link, settlement_balance, "order" RESTART IDENTITY CASCADE',
    );
    h.counterparties.clear();
    h.contracts.clear();
});

const entry = (): Promise<SettlementDocumentEntry> =>
    h.dataSource.getRepository(SettlementDocumentEntry).findOneOrFail({ where: {} });
const link = (): Promise<SettlementOrderLink> =>
    h.dataSource.getRepository(SettlementOrderLink).findOneOrFail({ where: {} });

describe('SettlementReconcileService (real Postgres)', () => {
    it('attaches counterparty and contract that arrived without an event, twice safely', async () => {
        await h.documents.apply(ctx, documentInput('d1'));
        h.counterparties.set('cp-1', 5);
        h.contracts.set('ct-1', 9);

        const first = await h.reconcile.reconcile(ctx);
        const second = await h.reconcile.reconcile(ctx);

        expect(first).toMatchObject({ counterparties: 1, contracts: 1 });
        expect(second).toEqual({ counterparties: 0, contracts: 0, orderLinks: 0 });
        expect(await entry()).toMatchObject({ counterpartyId: '5', contractId: '9' });
    });

    it('attaches balances too', async () => {
        await h.balances.apply(ctx, {
            key: 'k',
            version: '1',
            isDeleted: false,
            organizationErpId: 'org-1',
            counterpartyErpId: 'cp-1',
            contractErpId: 'ct-1',
            currency: 'RUB',
            openingDate: null,
            openingBalance: 0,
            closingBalance: 0,
        });
        h.counterparties.set('cp-1', 5);

        await h.reconcile.reconcile(ctx);

        const [row] = await h.dataSource.query(`SELECT "counterpartyId" FROM settlement_balance`);
        expect(row.counterpartyId).toBe('5');
    });

    it('links an order created after the document arrived, by erp id and by uuid', async () => {
        const base = documentInput('x').entries[0];
        await h.documents.apply(
            ctx,
            documentInput('d1', {
                entries: [
                    {
                        ...base,
                        orderLinks: [
                            { orderErpId: 'o-erp', orderUuid: null, amount: 1 },
                            { orderErpId: 'o-uuid', orderUuid: 'uuid-1', amount: 2 },
                        ],
                    },
                ],
            }),
        );
        await h.dataSource.query(
            `INSERT INTO "order" (state, "customFieldsErporderid") VALUES ('PaymentAuthorized', 'o-erp')`,
        );
        await h.dataSource.query(
            `INSERT INTO "order" (state, "customFieldsUuid") VALUES ('PaymentAuthorized', 'uuid-1')`,
        );

        const result = await h.reconcile.reconcile(ctx);

        expect(result.orderLinks).toBe(2);
        const rows = await h.dataSource
            .getRepository(SettlementOrderLink)
            .find({ order: { orderErpId: 'ASC' } });
        expect(rows.map(r => r.orderId)).toEqual([1, 2]);
        expect(await link()).toBeDefined();
    });

    it('leaves rows without a matching counterparty or order pending', async () => {
        const base = documentInput('x').entries[0];
        await h.documents.apply(
            ctx,
            documentInput('d1', {
                entries: [
                    { ...base, orderLinks: [{ orderErpId: 'o-1', orderUuid: null, amount: 1 }] },
                ],
            }),
        );

        const result = await h.reconcile.reconcile(ctx);

        expect(result).toEqual({ counterparties: 0, contracts: 0, orderLinks: 0 });
        expect((await entry()).counterpartyId).toBeNull();
    });
});
