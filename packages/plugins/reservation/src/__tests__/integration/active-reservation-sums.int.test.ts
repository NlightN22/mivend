import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { sumActiveReservations } from '../../active-reservation-sums';
import { Reservation } from '../../entities/reservation.entity';

const { schema, extra } = testSchemaOptions('active_reservation_sums');
const ctx = {} as RequestContext;
let dataSource: DataSource;
let connection: TransactionalConnection;
let lineSeq = 0;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [Reservation],
        synchronize: true,
    });
    await dataSource.initialize();
    connection = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            dataSource.getRepository(entity as never),
    } as unknown as TransactionalConnection;
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE reservation RESTART IDENTITY CASCADE');
});

async function reserve(
    variant: string,
    location: string,
    quantity: number,
    status: 'active' | 'released' | 'expired' = 'active',
): Promise<void> {
    await dataSource.getRepository(Reservation).insert({
        orderId: 'order-1',
        orderLineId: `line-${++lineSeq}`,
        productVariantId: variant,
        stockLocationId: location,
        quantity,
        status,
        reservedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        creationMethod: 'manual',
        erpOperationId: `op-${lineSeq}`,
    } as never);
}

describe('sumActiveReservations (real Postgres)', () => {
    it('adds up several active rows per (variant, location), as the old per-row accumulation did', async () => {
        await reserve('v1', 'l1', 2);
        await reserve('v1', 'l1', 5);
        await reserve('v1', 'l2', 4);
        await reserve('v2', 'l1', 9);

        const sums = await sumActiveReservations(connection, ctx, ['v1', 'v2'], ['l1', 'l2']);

        expect(Object.fromEntries(sums)).toEqual({ 'v1:l1': 7, 'v1:l2': 4, 'v2:l1': 9 });
    });

    it('ignores released and expired reservations', async () => {
        await reserve('v1', 'l1', 3);
        await reserve('v1', 'l1', 100, 'released');
        await reserve('v1', 'l1', 200, 'expired');

        const sums = await sumActiveReservations(connection, ctx, ['v1'], ['l1']);

        expect(sums.get('v1:l1')).toBe(3);
    });

    it('omits a location with no active reservation and ignores locations and variants not asked for', async () => {
        await reserve('v1', 'l1', 3);
        await reserve('v1', 'l9', 8);
        await reserve('v9', 'l1', 8);
        await reserve('v1', 'l2', 6, 'released');

        const sums = await sumActiveReservations(connection, ctx, ['v1'], ['l1', 'l2']);

        expect([...sums.keys()]).toEqual(['v1:l1']);
    });

    it('keeps a zero-quantity active row as a present zero', async () => {
        await reserve('v1', 'l1', 0);

        const sums = await sumActiveReservations(connection, ctx, ['v1'], ['l1']);

        expect(sums.has('v1:l1')).toBe(true);
        expect(sums.get('v1:l1')).toBe(0);
    });

    it('returns an empty map for empty lists without querying', async () => {
        await reserve('v1', 'l1', 3);

        expect((await sumActiveReservations(connection, ctx, [], ['l1'])).size).toBe(0);
        expect((await sumActiveReservations(connection, ctx, ['v1'], [])).size).toBe(0);
    });
});
