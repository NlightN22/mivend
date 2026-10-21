import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource, EntitySchema } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { AdminPaymentVisibilityResolver } from '../../admin-payment-visibility.resolver';
import { PaymentAttemptQueryService } from '../../payment-attempt-query.service';

const paymentSchema = new EntitySchema({
    name: 'payment_attempt',
    target: PaymentAttempt,
    columns: {
        id: { type: Number, primary: true, generated: true },
        orderId: { type: Number },
        amount: { type: Number },
        paymentStatus: { type: String },
    },
});

const { schema, extra } = testSchemaOptions('order_payment_summaries_scope');
let dataSource: DataSource;
let resolver: AdminPaymentVisibilityResolver;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [paymentSchema],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE "order" (id serial PRIMARY KEY, "branchId" varchar)`);
    await dataSource.query(`INSERT INTO "order" ("branchId") VALUES ('branch-a'), ('branch-b')`);
    await dataSource.query(
        `INSERT INTO payment_attempt ("orderId", amount, "paymentStatus") VALUES (1, 300, 'captured'), (2, 700, 'captured')`,
    );
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            dataSource.getRepository(entity as never),
    } as unknown as TransactionalConnection;
    // Stands in for OrderVisibilityService.visibleIds, whose scope rules erp-order's int tests cover.
    const visibility = {
        visibleIds: async (_ctx: unknown, ids: string[]) =>
            new Set(
                (
                    await dataSource.query(
                        `SELECT id::text FROM "order" WHERE "branchId" = 'branch-a' AND id::text = ANY($1)`,
                        [ids],
                    )
                ).map((r: { id: string }) => r.id),
            ),
    };
    resolver = new AdminPaymentVisibilityResolver(
        {} as never,
        new PaymentAttemptQueryService(connection),
        visibility as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('orderPaymentSummaries scope (#263, real Postgres)', () => {
    it('a hidden order with a captured payment answers like a missing order', async () => {
        const result = await resolver.orderPaymentSummaries({} as RequestContext, {
            orderIds: ['1', '2', '99'],
        });
        expect(result).toEqual([
            { orderId: '1', capturedAmount: 300 },
            { orderId: '2', capturedAmount: 0 },
            { orderId: '99', capturedAmount: 0 },
        ]);
    });
});
