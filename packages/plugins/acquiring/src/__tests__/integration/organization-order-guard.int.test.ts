import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { TransactionalConnection } from '@vendure/core';
import type { Injector, Order, RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import {
    organizationOrderGuard,
    ORGANIZATION_MISSING_MESSAGE,
} from '../../organization-order-guard';

// Real SQL over hand-rolled order_line/product_variant tables (Vendure entities need bootstrap).
const { schema, extra } = testSchemaOptions('organization_order_guard');
let dataSource: DataSource;

const run = (sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> =>
    dataSource.query(sql, params);

async function addLine(orderId: number, sku: string, organizationId: number | null) {
    const [variant] = await run(
        `INSERT INTO product_variant (sku, "customFieldsOrganizationid") VALUES ($1, $2) RETURNING id`,
        [sku, organizationId],
    );
    await run(`INSERT INTO order_line ("orderId", "productVariantId") VALUES ($1, $2)`, [
        orderId,
        variant.id,
    ]);
}

const checkout = (orderId: number) =>
    organizationOrderGuard.onTransitionStart?.('AddingItems', 'ArrangingPayment', {
        ctx: {} as RequestContext,
        order: { id: orderId } as unknown as Order,
    });

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await run(`CREATE TABLE product_variant (
        id serial PRIMARY KEY, sku varchar, "customFieldsOrganizationid" int)`);
    await run(`CREATE TABLE order_line (
        id serial PRIMARY KEY, "orderId" int, "productVariantId" int,
        "customFieldsOrganizationid" int)`);
    const injector = {
        get: (token: unknown) =>
            token === TransactionalConnection
                ? {
                      rawConnection: dataSource,
                      getRepository: () => ({ query: run }),
                  }
                : undefined,
    } as unknown as Injector;
    void organizationOrderGuard.init?.(injector);
});

beforeEach(async () => {
    await run(`TRUNCATE order_line, product_variant RESTART IDENTITY`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const stamp = (orderId: number) =>
    organizationOrderGuard.onTransitionEnd?.('AddingItems', 'ArrangingPayment', {
        ctx: {} as RequestContext,
        order: { id: orderId } as unknown as Order,
    });

const lineOrganizations = async (orderId: number) =>
    (
        await run(
            `SELECT "customFieldsOrganizationid" AS org FROM order_line WHERE "orderId" = $1 ORDER BY id`,
            [orderId],
        )
    ).map(row => row.org);

describe('organizationOrderGuard (real SQL)', () => {
    it('names only the lines of this order whose variant has no organization', async () => {
        await addLine(1, 'OK-1', 7);
        await addLine(1, 'NO-ORG-1', null);
        await addLine(2, 'NO-ORG-OTHER-ORDER', null);

        expect(await checkout(1)).toBe(`${ORGANIZATION_MISSING_MESSAGE}NO-ORG-1`);
    });

    it('allows an order whose every variant has an organization', async () => {
        await addLine(1, 'OK-1', 7);
        await addLine(1, 'OK-2', 8);
        await addLine(2, 'NO-ORG-OTHER-ORDER', null);

        expect(await checkout(1)).toBeUndefined();
    });

    it('stamps each line of this order with its variant organization, leaving other orders alone', async () => {
        await addLine(1, 'A', 7);
        await addLine(1, 'B', 8);
        await addLine(2, 'OTHER', 9);

        await stamp(1);

        expect(await lineOrganizations(1)).toEqual([7, 8]);
        expect(await lineOrganizations(2)).toEqual([null]);
    });

    it('re-stamps on re-entry, so a changed variant organization is picked up', async () => {
        await addLine(1, 'A', 7);
        await stamp(1);
        await run(`UPDATE product_variant SET "customFieldsOrganizationid" = 11`);

        await stamp(1);

        expect(await lineOrganizations(1)).toEqual([11]);
    });

    it('does not stamp on other transitions', async () => {
        await addLine(1, 'A', 7);

        await organizationOrderGuard.onTransitionEnd?.('ArrangingPayment', 'PaymentAuthorized', {
            ctx: {} as RequestContext,
            order: { id: 1 } as unknown as Order,
        });

        expect(await lineOrganizations(1)).toEqual([null]);
    });
});
