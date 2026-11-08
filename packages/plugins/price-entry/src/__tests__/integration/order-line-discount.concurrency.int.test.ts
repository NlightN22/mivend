import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryColumn } from 'typeorm';
import { UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
    withAggregateLock,
} from 'shared';

import { OrderLineDiscountService } from '../../order-line-discount.service';
import type { LineDiscount } from '../../line-discount.service';

@Entity('test_discount_line')
class TestLine {
    @PrimaryColumn({ type: 'int' }) id!: number;
    @Column({ type: 'int' }) price!: number;
    @Column({ type: 'boolean', default: false }) manual!: boolean;
}

const REFERENCE = 100;
let dataSource: DataSource;
let service: OrderLineDiscountService;
const { schema, extra } = testSchemaOptions('price_entry_line_discount');
const ctx: RequestContext = testRequestContext;

// The edit runs under the same advisory lock as OrderLineEditService.edit; the line is read inside it.
function buildService(): OrderLineDiscountService {
    const connection = createTestConnection(dataSource);
    const lineEdit = {
        edit: (
            c: RequestContext,
            _orderId: unknown,
            _kind: unknown,
            change: (tx: RequestContext, order: unknown) => Promise<string | null>,
        ) =>
            withAggregateLock(connection, c, 'reserve-order:1', async tx => {
                const row = await connection.getRepository(tx, TestLine).findOneByOrFail({ id: 1 });
                const line = {
                    id: 1,
                    customFields: { manualUnitPrice: row.manual ? row.price : null },
                    productVariant: { sku: 'A' },
                };
                (line as { row?: TestLine }).row = row;
                await change(tx, { lines: [line] });
            }),
        lineOf: (order: { lines: unknown[] }) => order.lines[0],
        persist: async (tx: RequestContext, _o: unknown, lines: Array<Record<string, unknown>>) => {
            const fields = lines[0].customFields as { manualUnitPrice: number | null };
            await connection.getRepository(tx, TestLine).update(1, {
                price: fields.manualUnitPrice ?? REFERENCE,
                manual: fields.manualUnitPrice !== null,
            });
        },
    };
    const discounts = {
        forOrder: async (tx: RequestContext): Promise<LineDiscount[]> => {
            const row = await connection.getRepository(tx, TestLine).findOneByOrFail({ id: 1 });
            return [
                {
                    lineId: '1',
                    productErpId: 'p1',
                    reference: REFERENCE,
                    effective: row.price,
                    percent: null,
                    manual: row.manual,
                },
            ];
        },
    };
    return new OrderLineDiscountService(
        lineEdit as never,
        { findOne: async () => ({ lines: [] }) } as never,
        discounts as never,
        {
            ceilingsForProducts: async () => new Map([['p1', null]]),
            actorAdministratorId: async () => '7',
        } as never,
    );
}

const priceNow = async () =>
    (await dataSource.getRepository(TestLine).findOneByOrFail({ id: 1 })).price;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestLine],
        synchronize: true,
    });
    await dataSource.initialize();
    service = buildService();
});

beforeEach(async () => {
    await dataSource.getRepository(TestLine).clear();
    await dataSource.getRepository(TestLine).save({ id: 1, price: 80, manual: true });
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('OrderLineDiscountService under concurrent edits (integration, real Postgres)', () => {
    it('never lets a stale read lower the price: two reductions and an increase of the same line', async () => {
        for (let round = 0; round < 8; round++) {
            await dataSource.getRepository(TestLine).update(1, { price: 80, manual: true });
            const results = await Promise.allSettled([
                service.reduce(ctx, 1, 1, 90),
                service.reduce(ctx, 1, 1, 95),
                service.reduce(ctx, 1, 1, 70),
            ]);
            expect(await priceNow()).toBe(95);
            expect(results[2].status).toBe('rejected');
            expect((results[2] as PromiseRejectedResult).reason).toBeInstanceOf(UserInputError);
        }
    });

    it('keeps rejecting an increase after the line was reduced concurrently', async () => {
        await Promise.all([service.reduce(ctx, 1, 1, 90), service.reduce(ctx, 1, 1, 90)]);
        await expect(service.reduce(ctx, 1, 1, 89)).rejects.toBeInstanceOf(UserInputError);
        expect(await priceNow()).toBe(90);
    });

    it('serialises a revert and a reduction: either order ends at the automatic price', async () => {
        await Promise.allSettled([service.reduce(ctx, 1, 1, 90), service.revert(ctx, 1, 1)]);
        expect(await priceNow()).toBe(REFERENCE);
    });
});
