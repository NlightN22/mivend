import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ERP_DOCUMENT_ENTITIES } from '../../erp-documents/erp-document-entities';
import { SalesDocumentSourcesService } from '../../order-line-changes/sales-document-sources.service';
import { OrderLineChangesService } from '../../order-line-changes/order-line-changes.service';

const { schema, extra } = testSchemaOptions('order_line_changes');
const ctx = {} as RequestContext;
let dataSource: DataSource;
let service: OrderLineChangesService;
const order = { id: 1, customFields: { erpOrderId: 'o-1' } } as never;
const foreignOrder = { id: 2, customFields: { erpOrderId: 'o-2' } } as never;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: ERP_DOCUMENT_ENTITIES,
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE product (id serial primary key, "customFieldsExternalid" varchar)`,
    );
    await dataSource.query(`CREATE TABLE product_variant (id serial primary key, "productId" int)`);
    await dataSource.query(
        `CREATE TABLE order_line (id serial primary key, "orderId" int, "productVariantId" int, quantity int)`,
    );
    const connection = {
        getRepository: (_ctx: unknown, target: unknown) =>
            typeof target === 'string'
                ? { query: (sql: string, params?: unknown[]) => dataSource.query(sql, params) }
                : dataSource.getRepository(target as never),
    } as unknown as TransactionalConnection;
    service = new OrderLineChangesService(connection, new SalesDocumentSourcesService(connection));
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function correction(
    erpId: string,
    orderId: string,
    accounting: object | null,
): Promise<void> {
    const [{ id }] = await dataSource.query(
        `INSERT INTO sales_correction_erp ("erpId","sourceVersion","orderId",number,accounting,date)
         VALUES ($1,'1',$2,$3,$4,'2026-01-02') RETURNING id`,
        [erpId, orderId, erpId, accounting ? JSON.stringify(accounting) : null],
    );
    await dataSource.query(
        `INSERT INTO sales_correction_goods_line_erp ("documentId","lineNumber","productId",quantity,"quantityBeforeCorrection","unitCoefficient","amountMinor","amountBeforeCorrectionMinor")
         VALUES ($1,1,'prod-1',9,10,1,900,1000)`,
        [id],
    );
}

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE sales_correction_erp, sales_correction_goods_line_erp, customer_claim_erp, customer_claim_goods_line_erp, product, product_variant, order_line RESTART IDENTITY CASCADE',
    );
    await dataSource.query(`INSERT INTO product ("customFieldsExternalid") VALUES ('prod-1')`);
    await dataSource.query(`INSERT INTO product_variant ("productId") VALUES (1)`);
    await dataSource.query(
        `INSERT INTO order_line ("orderId","productVariantId",quantity) VALUES (1,1,10),(2,1,3)`,
    );
});

describe('OrderLineChangesService', () => {
    it('staff see an unflagged correction with the money effect', async () => {
        await correction('c-1', 'o-1', null);
        const result = await service.forOrder(ctx, order, 'staff');
        expect(result.lines.map(l => [l.orderLineId, l.ordered, l.actual])).toEqual([[1, 10, 9]]);
        expect(result.amountDeltaMinor).toBe(-100);
    });

    it('a customer sees only the accounting-reflected correction, without money', async () => {
        await correction('c-1', 'o-1', { reflectedInAccounting: false });
        await correction('c-2', 'o-1', { reflectedInAccounting: true });
        const result = await service.forOrder(ctx, order, 'customer');
        expect(result.lines[0].events.map(e => e.documentNumber)).toEqual(['c-2']);
        expect(result.amountDeltaMinor).toBe(0);
    });

    it('never mixes in another order, and a deleted document is ignored', async () => {
        await correction('c-1', 'o-2', { reflectedInAccounting: true });
        expect((await service.forOrder(ctx, order, 'staff')).lines).toEqual([]);
        expect((await service.forOrder(ctx, foreignOrder, 'staff')).lines).toHaveLength(1);
        await dataSource.query(`UPDATE sales_correction_erp SET "isDeleted" = true`);
        expect((await service.forOrder(ctx, foreignOrder, 'staff')).lines).toEqual([]);
    });

    it('a worked-out claim changes nothing for either audience', async () => {
        const [{ id }] = await dataSource.query(
            `INSERT INTO customer_claim_erp ("erpId","sourceVersion","orderId",number,"workedOut") VALUES ('k-1','1','o-1','k-1',true) RETURNING id`,
        );
        await dataSource.query(
            `INSERT INTO customer_claim_goods_line_erp ("documentId","lineNumber","productId",quantity,"amountMinor") VALUES ($1,1,'prod-1',2,200)`,
            [id],
        );
        expect((await service.forOrder(ctx, order, 'customer')).lines).toEqual([]);
        expect(await service.forOrder(ctx, order, 'staff')).toEqual({
            lines: [],
            amountDeltaMinor: 0,
        });
    });
});
