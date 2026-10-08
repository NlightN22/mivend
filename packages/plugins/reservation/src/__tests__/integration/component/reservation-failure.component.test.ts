import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Order, ProductVariant } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ErpExportDataMissingError, InsufficientStockError } from '../../../reservation-errors';
import { ReservationFailureService } from '../../../reservation-failure.service';
import { ReservationService } from '../../../reservation.service';

// Real Postgres: the failure reason is written as a partial customFields update (nothing else on
// the order is touched) and a successful reserve clears it (#199).
class TestOrderCustomFields {
    @Column({ name: 'customFieldsReservationstate', type: 'varchar', nullable: true })
    reservationState!: string | null;
    @Column({ name: 'customFieldsReservationdays', type: 'int', nullable: true })
    reservationDays!: number | null;
    @Column({ name: 'customFieldsReservationfailurereason', type: 'varchar', nullable: true })
    reservationFailureReason!: string | null;
    @Column({ name: 'customFieldsReservationfailuredetail', type: 'text', nullable: true })
    reservationFailureDetail!: string | null;
    @Column({ name: 'customFieldsReservationfailedat', type: 'timestamp', nullable: true })
    reservationFailedAt!: Date | null;
}

@Entity('order')
class TestOrder {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar' }) code!: string;
    @Column(() => TestOrderCustomFields, { prefix: false }) customFields!: TestOrderCustomFields;
}

@Entity('product_variant')
class TestVariant {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) sku!: string;
}

const { schema, extra } = testSchemaOptions('reservation_failure_component');
const ctx = {} as never;

let dataSource: DataSource;
let failures: ReservationFailureService;
let reservations: ReservationService;
let variantId: number;

const reload = async (id: string): Promise<TestOrder> =>
    dataSource.getRepository(TestOrder).findOneOrFail({ where: { id } });

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestOrder, TestVariant],
        synchronize: true,
    });
    await dataSource.initialize();
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            dataSource.getRepository(
                entity === Order
                    ? TestOrder
                    : entity === ProductVariant
                      ? TestVariant
                      : (entity as never),
            ),
    };
    failures = new ReservationFailureService(connection as never);
    reservations = new ReservationService(
        connection as never,
        null as never,
        null as never,
        null as never,
        null as never,
    );
    variantId = (await dataSource.getRepository(TestVariant).save({ sku: '574726' })).id;
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('reservation failure on the order (real Postgres)', () => {
    let orderId: string;

    beforeEach(async () => {
        const order = await dataSource.getRepository(TestOrder).save({
            code: `ORD-${Math.random()}`,
            customFields: {
                reservationState: 'AWAITING_CONFIRMATION',
                reservationDays: 7,
            } as never,
        });
        orderId = order.id;
    });

    it('stores the reason with the real SKU and leaves the rest of the order untouched', async () => {
        const error = new InsufficientStockError([
            { orderLineId: '1', productVariantId: String(variantId), required: 1, available: 0 },
        ]);

        await failures.record(ctx, orderId, error);

        const order = await reload(orderId);
        expect(order.customFields.reservationFailureReason).toBe('INSUFFICIENT_STOCK');
        expect(order.customFields.reservationFailureDetail).toBe('SKU 574726: need 1, available 0');
        expect(order.customFields.reservationFailedAt).toBeInstanceOf(Date);
        expect(order.customFields.reservationState).toBe('AWAITING_CONFIRMATION');
        expect(order.customFields.reservationDays).toBe(7);
    });

    it('keeps only the latest failure when it is recorded twice', async () => {
        await failures.record(ctx, orderId, new InsufficientStockError([]));
        await failures.record(ctx, orderId, new ErpExportDataMissingError(false, [], true));

        const order = await reload(orderId);
        expect(order.customFields.reservationFailureReason).toBe('ERP_EXPORT_DATA_MISSING');
        expect(order.customFields.reservationFailureDetail).toBe('no active contract');
    });

    it('records an unexpected error as UNEXPECTED', async () => {
        await failures.record(ctx, orderId, new Error('db down'));

        const order = await reload(orderId);
        expect(order.customFields.reservationFailureReason).toBe('UNEXPECTED');
        expect(order.customFields.reservationFailureDetail).toBe('db down');
    });

    it('is cleared by a successful reserve (state RESERVED) without touching other fields', async () => {
        await failures.record(ctx, orderId, new InsufficientStockError([]));

        await reservations.setOrderReservationState(
            ctx,
            (await reload(orderId)) as never,
            'RESERVED',
        );

        const order = await reload(orderId);
        expect(order.customFields.reservationState).toBe('RESERVED');
        expect(order.customFields.reservationFailureReason).toBeNull();
        expect(order.customFields.reservationFailureDetail).toBeNull();
        expect(order.customFields.reservationFailedAt).toBeNull();
        expect(order.customFields.reservationDays).toBe(7);
    });

    it('survives a non-RESERVED state change (the failure stays until a reserve succeeds)', async () => {
        await failures.record(ctx, orderId, new InsufficientStockError([]));

        await reservations.setOrderReservationState(
            ctx,
            (await reload(orderId)) as never,
            'AWAITING_CONFIRMATION',
        );

        expect((await reload(orderId)).customFields.reservationFailureReason).toBe(
            'INSUFFICIENT_STOCK',
        );
    });
});
