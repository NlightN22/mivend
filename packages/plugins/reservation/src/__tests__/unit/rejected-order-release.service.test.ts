import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RejectedOrderReleaseService } from '../../rejected-order-release.service';
import { ReservationReleasedEvent } from '../../reservation.events';
import { ReservationSettings } from '../../reservation-settings';

vi.mock('shared', async importOriginal => ({
    ...(await importOriginal<object>()),
    withOrderCancelLocks: vi.fn(
        async (_c: unknown, ctx: unknown, _id: string, fn: (c: unknown) => unknown) => fn(ctx),
    ),
}));

const DAY_MS = 86_400_000;

describe('RejectedOrderReleaseService.releaseDue', () => {
    let order: { id: string; code: string; customFields: Record<string, unknown> } | null;
    let active: Array<Record<string, unknown>>;
    let orderRepo: { findOne: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    let reservationRepo: {
        update: ReturnType<typeof vi.fn>;
        createQueryBuilder: ReturnType<typeof vi.fn>;
    };
    let eventBus: { publish: ReturnType<typeof vi.fn> };
    let notifications: { create: ReturnType<typeof vi.fn> };
    let service: RejectedOrderReleaseService;
    let candidateOrders: Array<{ id: string }>;

    beforeEach(() => {
        order = {
            id: 'order-9',
            code: 'ORD-9',
            customFields: {
                erpStatus: 'REJECTED',
                erpStatusAt: new Date(Date.now() - 30 * DAY_MS),
                erpOrderId: 'erp-9',
            },
        };
        active = [{ id: 'res-9', orderId: 'order-9', status: 'active' }];
        candidateOrders = [{ id: 'order-9' }];
        const queryBuilder = (rows: () => unknown[]): Record<string, ReturnType<typeof vi.fn>> => {
            const qb: Record<string, ReturnType<typeof vi.fn>> = {};
            for (const method of ['setLock', 'where', 'andWhere', 'select', 'setParameter']) {
                qb[method] = vi.fn(() => qb);
            }
            qb.getQuery = vi.fn(() => 'SELECT 1');
            qb.getMany = vi.fn(async () => rows());
            return qb;
        };
        const lockedQb = queryBuilder(() => active);
        const candidateQb = queryBuilder(() => candidateOrders);
        orderRepo = {
            findOne: vi.fn(async () => order),
            update: vi.fn(async () => ({})),
        };
        (orderRepo as Record<string, unknown>).createQueryBuilder = vi.fn(() => candidateQb);
        reservationRepo = {
            update: vi.fn(async () => ({})),
            createQueryBuilder: vi.fn(() => lockedQb),
        };
        const connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string } | string) =>
                entity === 'Channel'
                    ? { query: vi.fn(async () => [{ code: 'REJECTED' }]) }
                    : typeof entity !== 'string' && entity?.name === 'Order'
                      ? orderRepo
                      : reservationRepo,
            ),
        };
        eventBus = { publish: vi.fn() };
        notifications = { create: vi.fn(async () => ({})) };
        service = new RejectedOrderReleaseService(
            connection as never,
            { create: vi.fn(async () => ({})) } as never,
            notifications as never,
            eventBus as never,
            new ReservationSettings({ rejectedOrderReleaseDays: 3 }),
        );
    });

    it('releases the reserve under the locks, writes only the state key, then notifies and publishes', async () => {
        expect(await service.releaseDue()).toBe(1);

        expect(reservationRepo.update).toHaveBeenCalledWith(
            'res-9',
            expect.objectContaining({ status: 'released', releasedAt: expect.any(Date) }),
        );
        expect(orderRepo.update).toHaveBeenCalledWith('order-9', {
            customFields: { reservationState: 'RELEASED' },
        });
        expect(eventBus.publish.mock.calls[0][0]).toBeInstanceOf(ReservationReleasedEvent);
        expect(notifications.create).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                sourceType: 'reservation-rejected-release',
                sourceId: 'res-9',
            }),
        );
    });

    it('leaves an order that left REJECTED between the list and the lock untouched', async () => {
        (order as { customFields: Record<string, unknown> }).customFields.erpStatus = 'CONFIRMED';

        expect(await service.releaseDue()).toBe(0);

        expect(reservationRepo.update).not.toHaveBeenCalled();
        expect(orderRepo.update).not.toHaveBeenCalled();
        expect(eventBus.publish).not.toHaveBeenCalled();
        expect(notifications.create).not.toHaveBeenCalled();
    });

    it('leaves an order whose rejection is more recent than the deadline untouched', async () => {
        (order as { customFields: Record<string, unknown> }).customFields.erpStatusAt = new Date(
            Date.now() - DAY_MS,
        );

        expect(await service.releaseDue()).toBe(0);
        expect(reservationRepo.update).not.toHaveBeenCalled();
    });

    it('publishes and notifies nothing when the release rolls back, and fails the sweep', async () => {
        reservationRepo.update.mockRejectedValue(new Error('rollback'));

        await expect(service.releaseDue()).rejects.toThrow('rollback');

        expect(eventBus.publish).not.toHaveBeenCalled();
        expect(notifications.create).not.toHaveBeenCalled();
    });

    it('keeps the release when the notification fails after commit', async () => {
        notifications.create.mockRejectedValue(new Error('notify down'));

        expect(await service.releaseDue()).toBe(1);
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
    });
});
