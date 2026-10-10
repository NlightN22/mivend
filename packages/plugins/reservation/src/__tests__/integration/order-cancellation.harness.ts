import { randomUUID } from 'crypto';
import type { RequestContext } from '@vendure/core';

import { OrderCancelResultService } from '../../order-cancel-result.service';
import { OrderCancellationPortRegistry } from '../../order-cancellation.port';
import type { CancelSubmission } from '../../order-cancellation.decision';
import type { CancelRequestSubject, OrderCancellationPort } from '../../order-cancellation.port';
import { OrderErpStatusService } from '../../order-erp-status.service';
import { OrderCancellationService } from '../../order-cancellation.service';
import { ReservationWriteOffSyncService } from '../../reservation-write-off-sync.service';
import { TestOrder, TestPayment, TestReservation } from './reserve-order.harness';
import type { ReserveOrderHarness } from './reserve-order.harness';

export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export class FakePort implements OrderCancellationPort {
    submission: CancelSubmission = 'none';
    publisherWinsSkipRace = false;
    skipCalls = 0;
    requestCalls = 0;
    requested: CancelRequestSubject[] = [];
    delayMs = 0;

    async submissionState(): Promise<CancelSubmission> {
        await sleep(this.delayMs);
        return this.submission;
    }

    async skipPendingSubmission(): Promise<boolean> {
        this.skipCalls += 1;
        if (this.publisherWinsSkipRace || this.submission !== 'pending') return false;
        this.submission = 'none';
        return true;
    }

    async requestCancel(_ctx: RequestContext, subject: CancelRequestSubject): Promise<void> {
        this.requestCalls += 1;
        await sleep(this.delayMs);
        this.requested.push(subject);
    }
}

export interface CancellationFixture {
    port: FakePort;
    service: OrderCancellationService;
    results: OrderCancelResultService;
    writeOff: ReservationWriteOffSyncService;
    cancelOrderCalls: string[];
    cancelledPayments: string[];
    notifications: Array<Record<string, unknown>>;
    published: unknown[];
}

// Real services on real Postgres; only the Vendure services needing a full bootstrap are faked.
// cancelOrder takes a moment so a missing lock leaves a window for the competing writer.
export function buildCancellationFixture(h: ReserveOrderHarness): CancellationFixture {
    const fixture = {
        port: new FakePort(),
        cancelOrderCalls: [] as string[],
        cancelledPayments: [] as string[],
        notifications: [] as Array<Record<string, unknown>>,
        published: [] as unknown[],
    } as CancellationFixture;

    const manager = (ctx: RequestContext) =>
        (ctx as unknown as { __manager: import('typeorm').EntityManager }).__manager;
    const orderService = {
        cancelOrder: async (ctx: RequestContext, input: { orderId: string }) => {
            fixture.cancelOrderCalls.push(String(input.orderId));
            await sleep(60);
            await manager(ctx)
                .getRepository(TestOrder)
                .update(input.orderId, { state: 'Cancelled' });
            return { id: input.orderId };
        },
    };
    const paymentService = {
        cancelPayment: async (ctx: RequestContext, paymentId: string) => {
            fixture.cancelledPayments.push(String(paymentId));
            await manager(ctx).getRepository(TestPayment).update(paymentId, { state: 'Cancelled' });
        },
    };
    const notificationService = {
        create: async (_ctx: unknown, input: Record<string, unknown>) => {
            fixture.notifications.push(input);
        },
    };
    const eventBus = {
        publish: (event: unknown) => {
            fixture.published.push(event);
        },
    };
    const registry = new OrderCancellationPortRegistry();
    registry.register(fixture.port);

    fixture.service = new OrderCancellationService(
        h.connection,
        orderService as never,
        paymentService as never,
        h.service,
        notificationService as never,
        eventBus as never,
        registry,
    );
    fixture.results = new OrderCancelResultService(h.connection, fixture.service);
    fixture.writeOff = new ReservationWriteOffSyncService(
        h.connection,
        h.service,
        {} as never,
        eventBus as never,
        new OrderErpStatusService(h.connection, fixture.results),
    );
    return fixture;
}

export async function seedCancellableOrder(
    h: ReserveOrderHarness,
    customFields: Record<string, unknown> = {},
    state = 'PaymentAuthorized',
): Promise<{ id: string; uuid: string }> {
    const uuid = randomUUID();
    const order = await h.dataSource.getRepository(TestOrder).save({
        customerId: 'customer-1',
        state,
        customFields: {
            uuid,
            branchId: 'branch-1',
            reservationState: 'RESERVED',
            erpStatus: 'PENDING',
            ...customFields,
        },
    });
    await h.dataSource.getRepository(TestReservation).save({
        orderId: order.id,
        orderLineId: randomUUID(),
        productVariantId: 'variant-1',
        stockLocationId: h.location.id,
        quantity: 2,
        status: 'active',
        reservedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        creationMethod: 'manual',
        erpOperationId: randomUUID(),
    });
    return { id: order.id, uuid };
}

export async function loadOrder(h: ReserveOrderHarness, id: string): Promise<TestOrder> {
    return h.dataSource.getRepository(TestOrder).findOneByOrFail({ id });
}

export async function activeReservations(h: ReserveOrderHarness, id: string): Promise<number> {
    return h.dataSource
        .getRepository(TestReservation)
        .count({ where: { orderId: id, status: 'active' } });
}
