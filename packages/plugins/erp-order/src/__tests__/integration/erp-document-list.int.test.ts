import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { CounterpartyService } from '@mivend/plugin-counterparty';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ERP_DOCUMENT_ENTITIES } from '../../erp-documents/erp-document-entities';
import { CustomerClaimErp } from '../../erp-documents/customer-claim-erp.entity';
import { OrderCorrectionErp } from '../../erp-documents/order-correction-erp.entity';
import { ErpDocumentLineSummaryService } from '../../erp-document-list/erp-document-line-summary.service';
import { ErpDocumentListService } from '../../erp-document-list/erp-document-list.service';

const { schema, extra } = testSchemaOptions('erp_document_list');
const ctx = { languageCode: 'en' } as RequestContext;
let dataSource: DataSource;
let service: ErpDocumentListService;
let visibleErpIds: string[] | null = null;

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
        `CREATE TABLE counterparty (id serial primary key, "erpId" varchar, "shortName" varchar, "legalName" varchar, inn varchar)`,
    );
    await dataSource.query(
        `CREATE TABLE "order" (id serial primary key, code varchar, "customFieldsErporderid" varchar)`,
    );
    await dataSource.query(
        `CREATE TABLE organization_requisites ("erpId" varchar, "legalName" varchar)`,
    );
    await dataSource.query(`CREATE TABLE contract ("erpId" varchar, name varchar)`);
    await dataSource.query(
        `CREATE TABLE product (id serial primary key, "customFieldsExternalid" varchar)`,
    );
    await dataSource.query(
        `CREATE TABLE product_translation ("baseId" int, "languageCode" varchar, name varchar)`,
    );
    const connection = {
        getRepository: (_ctx: unknown, target: unknown) =>
            dataSource.getRepository(target as never),
    } as unknown as TransactionalConnection;
    const counterparties = {
        visibleErpIdsSql: async () =>
            visibleErpIds
                ? {
                      sql: 'SELECT "erpId" FROM counterparty WHERE "erpId" = ANY(:visibleErp)',
                      params: { visibleErp: visibleErpIds },
                  }
                : null,
    } as unknown as CounterpartyService;
    service = new ErpDocumentListService(
        connection,
        counterparties,
        new ErpDocumentLineSummaryService(connection),
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    visibleErpIds = null;
    await dataSource.query(
        'TRUNCATE customer_claim_erp, customer_claim_goods_line_erp, order_correction_erp, counterparty, "order", product, product_translation RESTART IDENTITY CASCADE',
    );
    await dataSource.query(
        `INSERT INTO counterparty ("erpId","shortName","legalName",inn) VALUES
         ('cp-a','Customer A','Customer A LLC','111'), ('cp-b','Customer B','Customer B LLC','222')`,
    );
    await dataSource.query(
        `INSERT INTO "order" (code, "customFieldsErporderid") VALUES ('1001','o-1')`,
    );
    await dataSource.query(`INSERT INTO product ("customFieldsExternalid") VALUES ('prod-1')`);
    await dataSource.query(`INSERT INTO product_translation VALUES (1,'en','Widget')`);
    const claims = dataSource.getRepository(CustomerClaimErp);
    const row = (
        n: string,
        cp: string,
        extra: Partial<CustomerClaimErp> = {},
    ): Partial<CustomerClaimErp> => ({
        erpId: `claim-${n}`,
        sourceVersion: '1',
        number: n,
        counterpartyId: cp,
        totalAmountMinor: 1000,
        date: new Date(Date.UTC(2026, 0, Number(n))),
        ...extra,
    });
    await claims.save([
        row('1', 'cp-a', { orderId: 'o-1' }),
        row('2', 'cp-a'),
        row('3', 'cp-b'),
        row('4', 'cp-a', { isDeleted: true }),
        row('5', 'unknown-cp'),
    ]);
    await dataSource.query(
        `INSERT INTO customer_claim_goods_line_erp ("documentId","lineNumber","productId") VALUES (1,1,'prod-1'),(1,2,'prod-1')`,
    );
    await dataSource.getRepository(OrderCorrectionErp).save({
        erpId: 'oc-1',
        sourceVersion: '1',
        number: 'C1',
        counterpartyId: 'cp-a',
        orderId: 'o-1',
        totalAmountMinor: 5,
    });
});

const numbers = async (
    list: Parameters<ErpDocumentListService['findVisible']>[2],
): Promise<string[]> =>
    (await service.findVisible(ctx, 'customerClaim', list)).items.map(i => i.number);

describe('ERP document list (real Postgres)', () => {
    it('hides tombstones and resolves order, counterparty and product names', async () => {
        const page = await service.findVisible(ctx, 'customerClaim', {});
        expect(page.totalItems).toBe(4);
        expect(page.items.map(i => i.number)).toEqual(['5', '3', '2', '1']);
        const first = page.items.find(i => i.number === '1');
        expect(first).toMatchObject({
            orderCode: '1001',
            counterpartyName: 'Customer A',
            lineCount: 2,
            productNames: ['Widget'],
            amount: 1000,
        });
    });

    it('shows only documents of visible counterparties, never unresolved ones', async () => {
        visibleErpIds = ['cp-a'];
        expect(await numbers({})).toEqual(['2', '1']);
        visibleErpIds = [];
        expect(await numbers({})).toEqual([]);
        expect((await service.relatedCounts(ctx, '1', null)).customerClaims).toBe(0);
    });

    it('applies search and filters on top of the scope, with pagination and count-only', async () => {
        visibleErpIds = ['cp-a'];
        expect(await numbers({ search: '1001' })).toEqual(['1']);
        expect(await numbers({ search: 'customer b' })).toEqual([]);
        expect(await numbers({ filter: { number: { eq: '2' } } })).toEqual(['2']);
        expect(await numbers({ take: 1, skip: 1, sort: { number: 'ASC' } })).toEqual(['2']);
        expect(await service.findVisible(ctx, 'customerClaim', { take: 0 })).toEqual({
            items: [],
            totalItems: 2,
        });
        expect(await numbers({ search: "x' OR '1'='1" })).toEqual([]);
    });

    it('counts related documents of all three types by order or counterparty', async () => {
        const byOrder = await service.relatedCounts(ctx, '1', null);
        expect(byOrder).toEqual({ customerClaims: 1, salesCorrections: 0, orderCorrections: 1 });
        const byCounterparty = await service.relatedCounts(ctx, null, '2');
        expect(byCounterparty).toEqual({
            customerClaims: 1,
            salesCorrections: 0,
            orderCorrections: 0,
        });
    });
});
