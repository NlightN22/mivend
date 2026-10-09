import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Order } from '@vendure/core';
import { ErpOrderService, ErpOrderStatusEvent } from '@mivend/plugin-erp-order';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { Reservation } from '../../../entities/reservation.entity';
import {
    OrderRegistrationResultInput,
    ReservationWriteOffSyncService,
} from '../../../reservation-write-off-sync.service';

// Real ReservationWriteOffSyncService + real ErpOrderService.updateStatus on real Postgres: the
// registration-result -> erpOrderId -> order-changed correlation chain mocked unit tests missed.
class TestOrderCustomFields {
    @Column({ name: 'customFieldsErpstatus', type: 'varchar', nullable: true })
    erpStatus!: string | null;
    @Column({ name: 'customFieldsErporderid', type: 'varchar', nullable: true })
    erpOrderId!: string | null;
    @Column({ name: 'customFieldsErpstatusat', type: 'timestamp', nullable: true })
    erpStatusAt!: Date | null;
    @Column({ name: 'customFieldsErpregistrationdocumentnumber', type: 'varchar', nullable: true })
    erpRegistrationDocumentNumber!: string | null;
    @Column({ name: 'customFieldsErpregistrationstatus', type: 'varchar', nullable: true })
    erpRegistrationStatus!: string | null;
    @Column({ name: 'customFieldsErporderstatus', type: 'varchar', nullable: true })
    erpOrderStatus!: string | null;
    @Column({ name: 'customFieldsErpcontractid', type: 'varchar', nullable: true })
    erpContractId!: string | null;
    @Column({ name: 'customFieldsErprejectionreasoncode', type: 'varchar', nullable: true })
    erpRejectionReasonCode!: string | null;
    @Column({ name: 'customFieldsErprejectionreasontext', type: 'varchar', nullable: true })
    erpRejectionReasonText!: string | null;
}

@Entity('order')
class TestOrder {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar' }) code!: string;
    @Column(() => TestOrderCustomFields, { prefix: false }) customFields!: TestOrderCustomFields;
}

@Entity('write_off_chain_test_reservation')
class TestReservation {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar' }) orderId!: string;
    @Column({ type: 'varchar' }) status!: string;
}

const { schema, extra } = testSchemaOptions('write_off_chain_component');
const ctx = {} as never;
const ERP_ID = 'erp-order-1';

let dataSource: DataSource;
let sync: ReservationWriteOffSyncService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestOrder, TestReservation],
        synchronize: true,
    });
    await dataSource.initialize();

    const connection = {
        rawConnection: dataSource,
        getRepository: (_ctx: unknown, entity: unknown) =>
            dataSource.getRepository(
                entity === Order
                    ? TestOrder
                    : entity === Reservation
                      ? TestReservation
                      : (entity as never),
            ),
    };
    const erpOrderService = new ErpOrderService(
        connection as never,
        null as never,
        null as never,
        null as never,
    );
    const eventBus = {
        publish: (event: unknown) => {
            if (event instanceof ErpOrderStatusEvent) {
                void erpOrderService.updateStatus(event.ctx, {
                    orderCode: event.orderCode,
                    status: event.status,
                    erpOrderId: event.erpOrderId,
                });
            }
        },
    };
    // publish() is fire-and-forget in production; track the promise so tests can await it.
    const pending: Promise<void>[] = [];
    const realUpdate = erpOrderService.updateStatus.bind(erpOrderService);
    erpOrderService.updateStatus = vi.fn((c, p) => {
        const run = realUpdate(c, p);
        pending.push(run);
        return run;
    });
    sync = new ReservationWriteOffSyncService(
        connection as never,
        { setOrderReservationState: vi.fn() } as never,
        { reportUnresolvedProductMapping: vi.fn(), reportQuantityMismatch: vi.fn() } as never,
        eventBus as never,
    );
    flush = async () => {
        await Promise.all(pending.splice(0));
    };
});

let flush: () => Promise<void>;

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "order", write_off_chain_test_reservation CASCADE');
});

async function seedOrder(erpStatus: string | null = 'PENDING'): Promise<TestOrder> {
    return dataSource
        .getRepository(TestOrder)
        .save({ code: 'ORDER-1', customFields: { erpStatus } });
}

async function reload(id: string): Promise<TestOrderCustomFields> {
    return (await dataSource.getRepository(TestOrder).findOneByOrFail({ id })).customFields;
}

function registrationResult(
    localOrderId: string,
    overrides: Partial<OrderRegistrationResultInput> = {},
): OrderRegistrationResultInput {
    return {
        orderUuid: null,
        orderEntityId: ERP_ID,
        requestEntityId: 'request-1',
        localOrderId,
        rejected: false,
        reservedLines: [],
        unresolvedProductIds: [],
        documentNumber: 'DOC-1',
        status: 'REGISTERED',
        rejectionReasonCode: null,
        rejectionReasonText: null,
        ...overrides,
    };
}

const orderChanged = {
    orderUuid: null,
    orderEntityId: ERP_ID,
    status: 'IN_PROGRESS',
    reservedLines: [],
    contractId: 'contract-1',
};

describe('order-registration-result -> order-changed chain (component, real Postgres)', () => {
    it('stores erpOrderId on registration so a later order-changed finds the order', async () => {
        const order = await seedOrder();

        await sync.handleOrderRegistrationResult(ctx, registrationResult(order.id));
        await flush();

        const stored = await reload(order.id);
        expect(stored.erpStatus).toBe('SENT_TO_ERP');
        expect(stored.erpOrderId).toBe(ERP_ID);
        expect(stored.erpRegistrationDocumentNumber).toBe('DOC-1');

        await sync.handleOrderChanged(ctx, orderChanged);
        const afterChange = await reload(order.id);
        expect(afterChange.erpOrderStatus).toBe('IN_PROGRESS');
        expect(afterChange.erpContractId).toBe('contract-1');
        expect(afterChange.erpOrderId).toBe(ERP_ID);
    });

    it('order-changed for an unknown orderEntityId throws so the inbox retries', async () => {
        await seedOrder();

        await expect(sync.handleOrderChanged(ctx, orderChanged)).rejects.toThrow(
            `order-changed: no Order found via orderUuid= or orderEntityId=${ERP_ID}`,
        );
    });

    it('rejected result keeps erpOrderId unset; a later registered result clears the reason and sets it', async () => {
        const order = await seedOrder();

        await sync.handleOrderRegistrationResult(
            ctx,
            registrationResult(order.id, {
                rejected: true,
                orderEntityId: null,
                rejectionReasonCode: 'NO_STOCK',
                rejectionReasonText: 'out of stock',
            }),
        );
        await flush();
        const rejected = await reload(order.id);
        expect(rejected.erpStatus).toBe('REJECTED');
        expect(rejected.erpRejectionReasonCode).toBe('NO_STOCK');
        expect(rejected.erpOrderId).toBeNull();

        await sync.handleOrderRegistrationResult(ctx, registrationResult(order.id));
        await flush();
        const registered = await reload(order.id);
        expect(registered.erpStatus).toBe('SENT_TO_ERP');
        expect(registered.erpOrderId).toBe(ERP_ID);
        expect(registered.erpRejectionReasonCode).toBeNull();
        expect(registered.erpRejectionReasonText).toBeNull();
    });

    it('repeating the same registered result is idempotent', async () => {
        const order = await seedOrder();
        await sync.handleOrderRegistrationResult(ctx, registrationResult(order.id));
        await flush();
        const first = await reload(order.id);

        await sync.handleOrderRegistrationResult(ctx, registrationResult(order.id));
        await flush();
        const second = await reload(order.id);

        expect(second.erpStatus).toBe('SENT_TO_ERP');
        expect(second.erpOrderId).toBe(ERP_ID);
        expect(second.erpRegistrationDocumentNumber).toBe('DOC-1');
        expect(second.erpStatusAt).toEqual(first.erpStatusAt);
    });

    // An order already SENT_TO_ERP before this flow existed has no erpOrderId; a registered result fills it in.
    it('fills a missing erpOrderId on an order that is already SENT_TO_ERP', async () => {
        const order = await seedOrder('SENT_TO_ERP');

        await sync.handleOrderRegistrationResult(ctx, registrationResult(order.id));
        await flush();

        const stored = await reload(order.id);
        expect(stored.erpStatus).toBe('SENT_TO_ERP');
        expect(stored.erpOrderId).toBe(ERP_ID);
        await expect(sync.handleOrderChanged(ctx, orderChanged)).resolves.toBeUndefined();
    });
});
