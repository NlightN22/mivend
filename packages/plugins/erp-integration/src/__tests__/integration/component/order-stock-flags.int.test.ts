import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createOrderChecksWorld, resetWorld } from './order-checks.harness';
import type { OrderChecksWorld } from './order-checks.harness';

// Real Postgres: the storage-unit join on product and the ERP flags that make check 2 skip or convert.
let w: OrderChecksWorld;

beforeAll(async () => {
    w = await createOrderChecksWorld('erp_order_stock_flags');
});
afterAll(async () => {
    await w?.close();
});
beforeEach(async () => {
    await resetWorld(w);
});

async function seedShortOrder(): Promise<string> {
    const orderId = await w.seedOrder([
        { sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 8 },
    ]);
    await w.seedAssignment('p-1', 'org-1');
    await w.seedContract('org-1');
    await w.seedStock('p-1', 'org-1', 3);
    return orderId;
}

const codes = async (orderId: string): Promise<string[]> =>
    (await w.results(orderId)).map(r => String(r['checkCode']));

describe('organization stock check and the ERP stock-control flags', () => {
    it('flags the shortage when nothing says stock is not controlled', async () => {
        const orderId = await seedShortOrder();

        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');

        expect(await codes(orderId)).toEqual(['erp.organization-stock']);
    });

    it('skips the check for an organization flagged controlsStock = false, not for null or true', async () => {
        const orderId = await seedShortOrder();

        await w.dataSource.query(`UPDATE organization_requisites SET "controlsStock" = true`);
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        expect(await codes(orderId)).toEqual(['erp.organization-stock']);

        await w.dataSource.query(`UPDATE organization_requisites SET "controlsStock" = false`);
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        expect(await codes(orderId)).toEqual([]);

        await w.dataSource.query(`UPDATE organization_requisites SET "controlsStock" = NULL`);
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        expect(await codes(orderId)).toEqual(['erp.organization-stock']);
    });

    it('skips the check while the global ignore setting is true, not when false, absent or deleted', async () => {
        const orderId = await seedShortOrder();
        const setting = (value: string, deleted = false): Promise<unknown> =>
            w.dataSource.query(
                `INSERT INTO setting_erp ("erpId", code, "boolValue", "isDeleted")
                 VALUES ('s-1', 'ignoreOrganizationStockCheckForAll', ${value}, ${deleted})
                 ON CONFLICT DO NOTHING`,
            );
        await setting('false');
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        expect(await codes(orderId)).toEqual(['erp.organization-stock']);

        await w.dataSource.query(`UPDATE setting_erp SET "boolValue" = true, "isDeleted" = true`);
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        expect(await codes(orderId)).toEqual(['erp.organization-stock']);

        await w.dataSource.query(`UPDATE setting_erp SET "isDeleted" = false`);
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        expect(await codes(orderId)).toEqual([]);
    });

    it('converts the needed quantity by the product storage unit ratio and keeps 1 without a unit', async () => {
        const orderId = await seedShortOrder();
        await w.dataSource.query(
            `INSERT INTO unit_record ("entityId", "ratioToBase") VALUES ('u-box', 4), ('u-zero', 0)`,
        );

        await w.dataSource.query(`UPDATE product SET "customFieldsErpstorageunitid" = 'u-box'`);
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        expect(await codes(orderId)).toEqual([]);

        await w.dataSource.query(`UPDATE product SET "customFieldsErpstorageunitid" = 'u-zero'`);
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        expect((await w.results(orderId))[0]['facts']).toMatchObject({ needed: 8, available: 3 });

        await w.dataSource.query(`UPDATE product SET "customFieldsErpstorageunitid" = 'u-unknown'`);
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        expect((await w.results(orderId))[0]['facts']).toMatchObject({ needed: 8 });
    });
});
