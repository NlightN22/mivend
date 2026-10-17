import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { EntityNotFoundError, RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CoreOrderScopeService } from '../../core-order-scope/core-order-scope.service';
import { OrderTargetService } from '../../core-order-scope/order-target.service';

// Replicas of the core tables and columns the target SQL reads (core entities need a bootstrapped Vendure).
const DDL = `
CREATE TABLE "order" (id serial PRIMARY KEY, state varchar NOT NULL, "customerId" int,
    "customFieldsBranchid" varchar);
CREATE TABLE order_line (id serial PRIMARY KEY, "orderId" int);
CREATE TABLE payment (id serial PRIMARY KEY, "orderId" int);
CREATE TABLE refund (id serial PRIMARY KEY, "paymentId" int);
CREATE TABLE order_line_reference (id serial PRIMARY KEY, discriminator varchar NOT NULL,
    "fulfillmentId" int, "orderLineId" int);
CREATE TABLE history_entry (id serial PRIMARY KEY, discriminator varchar NOT NULL, "orderId" int);
CREATE TABLE customer (id serial PRIMARY KEY, "customFieldsCounterpartyid" varchar,
    "emailAddress" varchar, "deletedAt" timestamp);
INSERT INTO "order" (id, state, "customerId", "customFieldsBranchid") VALUES
    (1, 'PaymentSettled', 1, 'branch-a'), (2, 'PaymentSettled', 2, 'branch-b'),
    (3, 'Draft', NULL, NULL), (4, 'Draft', 1, 'branch-b');
INSERT INTO order_line (id, "orderId") VALUES (11, 1), (12, 2);
INSERT INTO payment (id, "orderId") VALUES (21, 1), (22, 2);
INSERT INTO refund (id, "paymentId") VALUES (31, 21), (32, 22), (33, 999);
INSERT INTO order_line_reference (id, discriminator, "fulfillmentId", "orderLineId") VALUES
    (1, 'FulfillmentLine', 41, 11), (2, 'FulfillmentLine', 42, 12),
    (3, 'FulfillmentLine', 43, 11), (4, 'FulfillmentLine', 43, 12);
INSERT INTO history_entry (id, discriminator, "orderId") VALUES
    (51, 'OrderHistoryEntry', 1), (52, 'OrderHistoryEntry', 2), (53, 'CustomerHistoryEntry', NULL);
INSERT INTO customer (id, "customFieldsCounterpartyid", "emailAddress", "deletedAt") VALUES
    (61, 'cp-own', 'own@buyer.example', NULL), (62, 'cp-foreign', 'foreign@buyer.example', NULL),
    (63, NULL, NULL, NULL), (64, 'cp-foreign', 'gone@buyer.example', now());
`;

const { schema, extra } = testSchemaOptions('core_order_scope');
let dataSource: DataSource;
const ctx = {} as RequestContext;

// Caller scope: orders of branch-a, counterparty cp-own; the visibility rules themselves are
// OrderVisibilityService's and CounterpartyService's own tests.
function service(counterpartyScope: 'own' | 'all' = 'own'): CoreOrderScopeService {
    const connection = { getRepository: () => ({ manager: dataSource.manager }) };
    const visibility = {
        visibleIds: async (_c: unknown, ids: string[]) => {
            const rows: Array<{ id: string }> = await dataSource.query(
                `SELECT id::text AS id FROM "order" WHERE "customFieldsBranchid" = 'branch-a' AND id::text = ANY($1)`,
                [ids],
            );
            return new Set(rows.map(r => r.id));
        },
    };
    const counterparties = {
        findOneVisible: async (_c: unknown, id: string) => (id === 'cp-own' ? { id } : null),
    };
    const accessScope = { resolveCounterpartyScope: async () => ({ kind: counterpartyScope }) };
    return new CoreOrderScopeService(
        visibility as never,
        new OrderTargetService(connection as never),
        counterparties as never,
        accessScope as never,
    );
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(DDL);
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

const cases: Array<[string, string, (id: number) => Record<string, unknown>, number, number]> = [
    ['order (read)', 'order', id => ({ id }), 1, 2],
    ['transitionOrderToState', 'transitionOrderToState', id => ({ id, state: 'Cancelled' }), 1, 2],
    ['cancelOrder', 'cancelOrder', id => ({ input: { orderId: id } }), 1, 2],
    ['modifyOrder', 'modifyOrder', id => ({ input: { orderId: id, dryRun: true } }), 1, 2],
    [
        'addNoteToOrder',
        'addNoteToOrder',
        id => ({ input: { id, note: 'x', isPublic: false } }),
        1,
        2,
    ],
    ['draft edit', 'addItemToDraftOrder', id => ({ orderId: id, input: {} }), 1, 2],
    [
        'addFulfillmentToOrder (line)',
        'addFulfillmentToOrder',
        id => ({ input: { lines: [{ orderLineId: id, quantity: 1 }] } }),
        11,
        12,
    ],
    ['settlePayment', 'settlePayment', id => ({ id }), 21, 22],
    ['refundOrder', 'refundOrder', id => ({ input: { paymentId: id } }), 21, 22],
    ['settleRefund', 'settleRefund', id => ({ input: { id, transactionId: 't' } }), 31, 32],
    [
        'transitionFulfillmentToState',
        'transitionFulfillmentToState',
        id => ({ id, state: 'Shipped' }),
        41,
        42,
    ],
    ['deleteOrderNote', 'deleteOrderNote', id => ({ id }), 51, 52],
    [
        'setOrderCustomer (customer)',
        'setOrderCustomer',
        id => ({ input: { orderId: 1, customerId: id } }),
        61,
        62,
    ],
];

describe('core order scope on real SQL', () => {
    it.each(cases)(
        '%s: an own target passes, a foreign one is not found',
        async (_l, field, args, own, foreign) => {
            await expect(service().assertInScope(ctx, field, args(own))).resolves.toBeUndefined();
            await expect(service().assertInScope(ctx, field, args(foreign))).rejects.toBeInstanceOf(
                EntityNotFoundError,
            );
        },
    );

    it('a fulfillment spanning an own and a foreign order is refused', async () => {
        await expect(
            service().assertInScope(ctx, 'transitionFulfillmentToState', { id: 43 }),
        ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('a refund whose payment is gone is refused, not left to core', async () => {
        await expect(
            service().assertInScope(ctx, 'settleRefund', { input: { id: 33 } }),
        ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('a customer note id is not an order note and is left to core', async () => {
        await expect(
            service().assertInScope(ctx, 'deleteOrderNote', { id: 53 }),
        ).resolves.toBeUndefined();
    });

    it('a non-existent id is left to core', async () => {
        await expect(service().assertInScope(ctx, 'order', { id: 404 })).resolves.toBeUndefined();
    });

    it('modifyOrder refunding a foreign payment on an own order is refused', async () => {
        await expect(
            service().assertInScope(ctx, 'modifyOrder', {
                input: { orderId: 1, refunds: [{ paymentId: 22 }] },
            }),
        ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('a customerless draft can be read and given an own customer, nothing else', async () => {
        await expect(service().assertInScope(ctx, 'order', { id: 3 })).resolves.toBeUndefined();
        await expect(
            service().assertInScope(ctx, 'setCustomerForDraftOrder', {
                orderId: 3,
                customerId: 61,
            }),
        ).resolves.toBeUndefined();
        await expect(
            service().assertInScope(ctx, 'setCustomerForDraftOrder', {
                orderId: 3,
                customerId: 62,
            }),
        ).rejects.toBeInstanceOf(EntityNotFoundError);
        for (const field of [
            'deleteDraftOrder',
            'addItemToDraftOrder',
            'setDraftOrderCustomFields',
        ]) {
            await expect(
                service().assertInScope(ctx, field, { orderId: 3, input: {} }),
            ).rejects.toBeInstanceOf(EntityNotFoundError);
        }
    });

    it('a draft that already has a foreign customer is not open', async () => {
        await expect(service().assertInScope(ctx, 'order', { id: 4 })).rejects.toBeInstanceOf(
            EntityNotFoundError,
        );
    });

    it('a customer without a counterparty is assignable only with scope all', async () => {
        const args = { input: { orderId: 1, customerId: 63 } };
        await expect(
            service('own').assertInScope(ctx, 'setOrderCustomer', args),
        ).rejects.toBeInstanceOf(EntityNotFoundError);
        await expect(
            service('all').assertInScope(ctx, 'setOrderCustomer', args),
        ).resolves.toBeUndefined();
    });

    it('a new-customer input naming an existing foreign customer by email is refused', async () => {
        const draft = (emailAddress: string) => ({ orderId: 1, input: { emailAddress } });
        await expect(
            service().assertInScope(
                ctx,
                'setCustomerForDraftOrder',
                draft(' Foreign@Buyer.example '),
            ),
        ).rejects.toBeInstanceOf(EntityNotFoundError);
        await expect(
            service().assertInScope(ctx, 'setCustomerForDraftOrder', draft('own@buyer.example')),
        ).resolves.toBeUndefined();
        await expect(
            service().assertInScope(ctx, 'setCustomerForDraftOrder', draft('new@buyer.example')),
        ).resolves.toBeUndefined();
        await expect(
            service().assertInScope(ctx, 'setCustomerForDraftOrder', draft('gone@buyer.example')),
        ).resolves.toBeUndefined();
    });

    it('a non-numeric or out-of-range id has no owner and is left to core', async () => {
        await expect(service().assertInScope(ctx, 'order', { id: 'abc' })).resolves.toBeUndefined();
        await expect(
            service().assertInScope(ctx, 'order', { id: '99999999999' }),
        ).resolves.toBeUndefined();
    });
});
