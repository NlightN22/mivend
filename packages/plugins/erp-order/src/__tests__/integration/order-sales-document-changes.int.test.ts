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
import { OrderLineChangesService } from '../../order-line-changes/order-line-changes.service';
import { SalesDocumentSourcesService } from '../../order-line-changes/sales-document-sources.service';

const { schema, extra } = testSchemaOptions('order_sales_documents');
const ctx = {} as RequestContext;
let dataSource: DataSource;
let service: OrderLineChangesService;
const order = { id: 1, customFields: { erpOrderId: 'o-1' } } as never;

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

interface DocInput {
    kind: string;
    erpId: string;
    dealId?: string;
    basis?: string;
    posted?: boolean;
    deletionMarked?: boolean;
    isDeleted?: boolean;
}

async function doc(
    input: DocInput,
    part: string,
    rows: { productId: string; quantity: number; linkedId?: string }[],
): Promise<void> {
    const [{ id }] = await dataSource.query(
        `INSERT INTO erp_sales_document (kind,"erpId","sourceVersion",number,date,posted,"deletionMarked","isDeleted","dealId","basisDocumentId")
         VALUES ($1,$2,'1',$2,'2026-01-02',$3,$4,$5,$6,$7) RETURNING id`,
        [
            input.kind,
            input.erpId,
            input.posted ?? true,
            input.deletionMarked ?? false,
            input.isDeleted ?? false,
            input.dealId ?? null,
            input.basis ?? null,
        ],
    );
    for (const [i, r] of rows.entries()) {
        await dataSource.query(
            `INSERT INTO erp_sales_document_line ("documentId","lineNumber",part,"productId",quantity,coefficient,"linkedId")
             VALUES ($1,$2,$3,$4,$5,1,$6)`,
            [id, i + 1, part, r.productId, r.quantity, r.linkedId ?? null],
        );
    }
}

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE erp_sales_document, erp_sales_document_line, customer_claim_erp, product, product_variant, order_line RESTART IDENTITY CASCADE',
    );
    await dataSource.query(`INSERT INTO product ("customFieldsExternalid") VALUES ('prod-1')`);
    await dataSource.query(`INSERT INTO product_variant ("productId") VALUES (1)`);
    await dataSource.query(
        `INSERT INTO order_line ("orderId","productVariantId",quantity) VALUES (1,1,10)`,
    );
});

const kinds = async (audience: 'customer' | 'staff'): Promise<string[]> =>
    (await service.forOrder(ctx, order, audience)).lines.flatMap(l => l.events.map(e => e.kind));

describe('sales document line changes', () => {
    it('follows order -> warehouse order -> work result and a return by the claim of the order', async () => {
        await doc({ kind: 'warehouse-order', erpId: 'w-1', basis: 'o-1' }, 'goods', [
            { productId: 'prod-1', quantity: 10 },
        ]);
        await doc(
            { kind: 'tl-warehouse-work-result', erpId: 'r-1', basis: 'w-1' },
            'warehouseWork',
            [{ productId: 'prod-1', quantity: 9 }],
        );
        await dataSource.query(
            `INSERT INTO customer_claim_erp ("erpId","sourceVersion","orderId",number) VALUES ('k-1','1','o-1','k')`,
        );
        await doc({ kind: 'customer-goods-return', erpId: 'ret-1', dealId: 'k-1' }, 'goods', [
            { productId: 'prod-1', quantity: 2 },
        ]);
        const result = await service.forOrder(ctx, order, 'staff');
        expect(result.lines[0].events.map(e => [e.kind, e.quantity])).toEqual(
            expect.arrayContaining([
                ['picking', 10],
                ['picked', 9],
                ['return', -2],
            ]),
        );
        expect(result.lines[0].actual).toBe(8);
    });

    it('resolves a warehouse order through the realization of the order', async () => {
        await doc({ kind: 'goods-and-services-sale', erpId: 's-1', dealId: 'o-1' }, 'goods', [
            { productId: 'prod-1', quantity: 10 },
        ]);
        await doc({ kind: 'warehouse-order', erpId: 'w-1', basis: 's-1' }, 'goods', [
            { productId: 'prod-1', quantity: 10 },
        ]);
        expect(await kinds('staff')).toEqual(expect.arrayContaining(['realization', 'picking']));
    });

    it('a row naming another order is not counted and an unlinked document is not guessed', async () => {
        await doc({ kind: 'goods-and-services-sale', erpId: 's-1', dealId: 'o-1' }, 'goods', [
            { productId: 'prod-1', quantity: 5, linkedId: 'o-9' },
        ]);
        await doc({ kind: 'customer-goods-return', erpId: 'ret-1' }, 'goods', [
            { productId: 'prod-1', quantity: 1 },
        ]);
        expect(await kinds('staff')).toEqual([]);
    });

    it('a customer sees only posted, unmarked and undeleted documents; staff see the marked ones', async () => {
        await doc({ kind: 'warehouse-order', erpId: 'w-1', basis: 'o-1', posted: false }, 'goods', [
            { productId: 'prod-1', quantity: 10 },
        ]);
        await doc(
            { kind: 'warehouse-order', erpId: 'w-2', basis: 'o-1', deletionMarked: true },
            'goods',
            [{ productId: 'prod-1', quantity: 10 }],
        );
        await doc(
            { kind: 'warehouse-order', erpId: 'w-3', basis: 'o-1', isDeleted: true },
            'goods',
            [{ productId: 'prod-1', quantity: 10 }],
        );
        await doc({ kind: 'warehouse-order', erpId: 'w-4', basis: 'o-1' }, 'goods', [
            { productId: 'prod-1', quantity: 10 },
        ]);
        expect(await kinds('customer')).toEqual(['picking']);
        expect(await kinds('staff')).toHaveLength(3);
    });

    it('reads only the source table part, so a huge unrelated part never trips the row ceiling', async () => {
        await doc({ kind: 'goods-and-services-sale', erpId: 's-1', dealId: 'o-1' }, 'goods', [
            { productId: 'prod-1', quantity: 10 },
        ]);
        const [{ id }] = await dataSource.query(
            `SELECT id FROM erp_sales_document WHERE "erpId" = 's-1'`,
        );
        await dataSource.query(
            `INSERT INTO erp_sales_document_line ("documentId","lineNumber",part,"productId",quantity,attributes)
             SELECT $1, g, 'serialNumbers', 'prod-1', 1, '{"employeeId":"secret"}' FROM generate_series(1, 1500) g`,
            [id],
        );
        expect(await kinds('staff')).toEqual(['realization']);
    });

    it('does not count a null-linked return row when the header names another order', async () => {
        await doc({ kind: 'customer-goods-return', erpId: 'ret-1', dealId: 'o-9' }, 'goods', [
            { productId: 'prod-1', quantity: 1 },
            { productId: 'prod-1', quantity: 2, linkedId: 'o-1' },
        ]);
        const result = await service.forOrder(ctx, order, 'staff');
        expect(result.lines[0].events.map(e => e.quantity)).toEqual([-2]);
    });

    it('gives no money for a return the ERP has not reflected', async () => {
        await dataSource.query(
            `INSERT INTO erp_sales_document (kind,"erpId","sourceVersion",number,posted,"dealId") VALUES ('customer-goods-return','ret-2','1','ret-2',false,'o-1')`,
        );
        const [{ id }] = await dataSource.query(
            `SELECT id FROM erp_sales_document WHERE "erpId" = 'ret-2'`,
        );
        await dataSource.query(
            `INSERT INTO erp_sales_document_line ("documentId","lineNumber",part,"productId",quantity,coefficient,"amountMinor") VALUES ($1,1,'goods','prod-1',1,1,500)`,
            [id],
        );
        const result = await service.forOrder(ctx, order, 'staff');
        expect(result.lines[0].events).toHaveLength(1);
        expect(result.amountDeltaMinor).toBe(0);
    });
});
