import { createTestConnection } from 'shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import { OrderSubmittedReconciler } from '../../../order-submitted-reconciler.service';

// Real Postgres with a minimal "order" table: only the columns the sweep selects on.
let dataSource: DataSource;
const enqueueConfirmed = vi.fn(async () => undefined);
let reconciler: OrderSubmittedReconciler;
const { schema, extra } = testSchemaOptions('erp_order_submitted_reconciler');

const insertOrder = async (
    id: number,
    over: { state?: string; reservation?: string; external?: boolean; ageMinutes?: number } = {},
): Promise<void> => {
    await dataSource.query(
        `INSERT INTO "order" (id, code, state, "customFieldsReservationstate", "customFieldsIsexternal", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, now() - ($6 || ' minutes')::interval)`,
        [
            id,
            `ORD-${id}`,
            over.state ?? 'ArrangingPayment',
            over.reservation ?? 'RESERVED',
            over.external ?? false,
            over.ageMinutes ?? 30,
        ],
    );
};

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationOutboxEntry],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE "order" (id int PRIMARY KEY, code text, state text,
          "customFieldsReservationstate" text, "customFieldsIsexternal" boolean, "updatedAt" timestamptz)`,
    );
    reconciler = new OrderSubmittedReconciler(
        createTestConnection(dataSource),
        { enqueueConfirmed } as never,
        { create: async () => ({}) as RequestContext } as never,
    );
});

afterEach(async () => {
    await dataSource.query('DELETE FROM "order"');
    await dataSource.getRepository(IntegrationOutboxEntry).clear();
    enqueueConfirmed.mockClear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('OrderSubmittedReconciler', () => {
    it('re-drives a reserved order that has no order.confirmed row', async () => {
        await insertOrder(1);

        expect(await reconciler.sweep()).toBe(1);
        expect(enqueueConfirmed).toHaveBeenCalledWith(expect.anything(), 1, 'ORD-1');
    });

    it('leaves orders with any outbox row, inside the grace period, cancelled, external or not reserved', async () => {
        await insertOrder(2);
        await dataSource.getRepository(IntegrationOutboxEntry).save({
            eventId: randomUUID(),
            eventType: 'order.confirmed',
            payload: { orderId: '2', orderCode: 'ORD-2' },
            status: 'skipped',
        });
        await insertOrder(3, { ageMinutes: 1 });
        await insertOrder(4, { state: 'Cancelled' });
        await insertOrder(5, { external: true });
        await insertOrder(6, { reservation: 'AWAITING_CONFIRMATION' });

        expect(await reconciler.sweep()).toBe(0);
        expect(enqueueConfirmed).not.toHaveBeenCalled();
    });
});
