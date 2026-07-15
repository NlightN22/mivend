import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventBus } from '@vendure/core';
import { ReservationConfirmedEvent, ReservationReleasedEvent } from '@mivend/plugin-reservation';

import { ReservationConsumer } from '../../consumers/reservation.consumer';
import type { SyncPluginOptions } from '../../types';

describe('ReservationConsumer', () => {
    let subscribers: Map<unknown, (event: unknown) => void>;
    let eventBus: { ofType: ReturnType<typeof vi.fn> };
    let syncService: { writeToOutbox: ReturnType<typeof vi.fn> };
    let dataSource: { transaction: ReturnType<typeof vi.fn> };
    const options: SyncPluginOptions = {
        instanceType: 'central',
        instanceId: 'hub',
        redis: { host: 'localhost', port: 6379 },
        rabbitmq: { url: 'amqp://localhost' },
    };

    beforeEach(() => {
        subscribers = new Map();
        eventBus = {
            ofType: vi.fn((eventClass: unknown) => ({
                subscribe: (fn: (event: unknown) => void) => subscribers.set(eventClass, fn),
            })),
        };
        syncService = { writeToOutbox: vi.fn(async () => undefined) };
        dataSource = { transaction: vi.fn(async (work: (em: unknown) => unknown) => work({})) };

        const consumer = new ReservationConsumer(
            eventBus as unknown as EventBus,
            syncService as never,
            dataSource as never,
            options,
        );
        consumer.onApplicationBootstrap();
    });

    it('writes a reservation.created outbox entry keyed by erpOperationId on ReservationConfirmedEvent', async () => {
        const handler = subscribers.get(ReservationConfirmedEvent)!;
        const reservation = {
            id: 'res-1',
            productVariantId: 'variant-1',
            quantity: 3,
            expiresAt: new Date('2026-02-01T00:00:00.000Z'),
            erpOperationId: 'op-created-uuid',
        };

        await handler(new ReservationConfirmedEvent({} as never, reservation as never, 'ORD-1'));

        expect(syncService.writeToOutbox).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                eventId: 'op-created-uuid',
                eventType: 'reservation.created',
                payload: expect.objectContaining({
                    reservationId: 'res-1',
                    variantId: 'variant-1',
                    branchId: 'hub',
                    quantity: 3,
                    orderCode: 'ORD-1',
                }),
            }),
            'erp',
        );
    });

    it('writes a reservation.released outbox entry keyed by erpReleaseOperationId on ReservationReleasedEvent', async () => {
        const handler = subscribers.get(ReservationReleasedEvent)!;
        const reservation = {
            id: 'res-1',
            erpOperationId: 'op-created-uuid',
            erpReleaseOperationId: 'op-released-uuid',
        };

        await handler(new ReservationReleasedEvent({} as never, reservation as never, 'ORD-1'));

        expect(syncService.writeToOutbox).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                eventId: 'op-released-uuid',
                eventType: 'reservation.released',
                payload: { reservationId: 'res-1', orderCode: 'ORD-1' },
            }),
            'erp',
        );
    });
});
