import { describe, it, expect, vi } from 'vitest';
import type { DataSource } from 'typeorm';

import { ReservationExpiryService } from '../../reservation-expiry.service';

describe('ReservationExpiryService.expireDueReservations', () => {
    function createService(
        dueRows: unknown[],
        orderRows: unknown[] = [],
        rejectedOrders: unknown[] = [],
        rejectedReservations: unknown[] = [],
    ): {
        service: ReservationExpiryService;
        txReservationRepo: {
            createQueryBuilder: ReturnType<typeof vi.fn>;
            update: ReturnType<typeof vi.fn>;
        };
        txOrderRepo: { find: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
        notificationService: { create: ReturnType<typeof vi.fn> };
        eventBus: { publish: ReturnType<typeof vi.fn> };
    } {
        // expireDueReservations reads the TTL-due rows and (only when REJECTED orders were
        // found) the REJECTED-due rows via createQueryBuilder().setLock(...).getMany() — see
        // reservation-expiry.service.ts's SKIP LOCKED comment — not repo.find().
        let reservationQueryCall = 0;
        const reservationQueryBuilder = {
            setLock: vi.fn().mockReturnThis(),
            setOnLocked: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            getMany: vi.fn(async () => {
                reservationQueryCall += 1;
                return reservationQueryCall === 1 ? dueRows : rejectedReservations;
            }),
        };
        const txReservationRepo = {
            createQueryBuilder: vi.fn(() => reservationQueryBuilder),
            update: vi.fn(async () => ({ affected: dueRows.length })),
        };
        // Order.find is called once for REJECTED orders past the deadline, then (only when a
        // non-prepaid TTL reservation is due) once more to re-check reservationState.
        let orderFindCall = 0;
        const txOrderRepo = {
            find: vi.fn(async () => {
                orderFindCall += 1;
                return orderFindCall === 1 ? rejectedOrders : orderRows;
            }),
            update: vi.fn(async (x: unknown) => x),
        };
        const manager = {
            getRepository: vi.fn((entity: { name?: string }) =>
                entity?.name === 'Order' ? txOrderRepo : txReservationRepo,
            ),
        };
        const dataSource = {
            transaction: vi.fn(async (work: (m: unknown) => unknown) => work(manager)),
        } as unknown as DataSource;
        const requestContextService = { create: vi.fn(async () => ({})) };
        const notificationService = { create: vi.fn(async () => ({})) };
        const eventBus = { publish: vi.fn() };
        return {
            service: new ReservationExpiryService(
                dataSource,
                requestContextService as never,
                notificationService as never,
                eventBus as never,
            ),
            txReservationRepo,
            txOrderRepo,
            notificationService,
            eventBus,
        };
    }

    it('expires past-due reservations and returns their orders to AWAITING_CONFIRMATION', async () => {
        const dueRows = [
            { id: 'res-1', orderId: 'order-1', creationMethod: 'manual' },
            { id: 'res-2', orderId: 'order-2', creationMethod: 'manual' },
        ];
        const { service, txReservationRepo, txOrderRepo } = createService(dueRows, [
            { id: 'order-1', customFields: { reservationState: 'RESERVED' } },
            { id: 'order-2', customFields: { reservationState: 'FAILED' } },
        ]);

        const count = await service.expireDueReservations();

        expect(count).toBe(2);
        expect(txReservationRepo.update).toHaveBeenCalled();
        expect(txOrderRepo.update).toHaveBeenCalledTimes(1);
        expect(txOrderRepo.update).toHaveBeenCalledWith('order-1', {
            customFields: { reservationState: 'AWAITING_CONFIRMATION' },
        });
    });

    it('is a no-op when nothing is due', async () => {
        const { service } = createService([]);
        const count = await service.expireDueReservations();
        expect(count).toBe(0);
    });

    it('never expires an auto-prepaid reservation — flags it for intervention instead', async () => {
        const dueRows = [
            {
                id: 'res-1',
                orderId: 'order-1',
                creationMethod: 'auto-prepaid',
                interventionFlaggedAt: null,
                expiresAt: new Date('2026-01-01'),
            },
        ];
        const { service, txReservationRepo, txOrderRepo } = createService(dueRows);

        const count = await service.expireDueReservations();

        expect(count).toBe(1);
        expect(txReservationRepo.update).toHaveBeenCalledWith(
            { id: expect.anything() },
            expect.objectContaining({ interventionFlaggedAt: expect.any(Date) }),
        );
        expect(txReservationRepo.update).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ status: 'expired' }),
        );
        expect(txOrderRepo.update).not.toHaveBeenCalled();
    });

    // issue #42/#87 Part 2: this sweep has no signed-in administrator, so the intervention flag
    // now broadcasts to every administrator instead of being silently unnotified.
    it('creates an administrator-broadcast Notification when flagging a prepaid reservation for intervention', async () => {
        const dueRows = [
            {
                id: 'res-1',
                orderId: 'order-1',
                creationMethod: 'auto-prepaid',
                interventionFlaggedAt: null,
                expiresAt: new Date('2026-01-01'),
            },
        ];
        const { service, notificationService } = createService(dueRows);

        await service.expireDueReservations();

        expect(notificationService.create).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                recipientType: 'administrator-broadcast',
                kind: 'error',
                sourceType: 'reservation-intervention',
                sourceId: 'res-1',
            }),
        );
    });

    it('does not re-flag an auto-prepaid reservation already flagged', async () => {
        const dueRows = [
            {
                id: 'res-1',
                orderId: 'order-1',
                creationMethod: 'auto-prepaid',
                interventionFlaggedAt: new Date('2026-01-01'),
            },
        ];
        const { service, txReservationRepo, notificationService } = createService(dueRows);

        const count = await service.expireDueReservations();

        expect(count).toBe(0);
        expect(txReservationRepo.update).not.toHaveBeenCalled();
        expect(notificationService.create).not.toHaveBeenCalled();
    });

    // issue #204: a reservation on an order the ERP rejected gets its own timeout, independent
    // of the reservation's own TTL — notify, then release, same as an explicit manual release.
    it('notifies and releases a reservation once its order has been REJECTED past the deadline', async () => {
        const rejectedOrders = [
            {
                id: 'order-9',
                customFields: { erpStatus: 'REJECTED', reservationState: 'RESERVED' },
            },
        ];
        const rejectedReservations = [
            { id: 'res-9', orderId: 'order-9', creationMethod: 'manual', status: 'active' },
        ];
        const { service, txReservationRepo, txOrderRepo, notificationService, eventBus } =
            createService([], [], rejectedOrders, rejectedReservations);

        const count = await service.expireDueReservations();

        expect(count).toBe(1);
        expect(notificationService.create).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                recipientType: 'administrator-broadcast',
                sourceType: 'reservation-rejected-release',
                sourceId: 'res-9',
            }),
        );
        expect(txReservationRepo.update).toHaveBeenCalledWith(
            'res-9',
            expect.objectContaining({ status: 'released', releasedAt: expect.any(Date) }),
        );
        expect(txOrderRepo.update).toHaveBeenCalledWith(
            'order-9',
            expect.objectContaining({
                customFields: expect.objectContaining({ reservationState: 'RELEASED' }),
            }),
        );
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
    });

    it('leaves a REJECTED order alone before its own deadline (no due reservation returned)', async () => {
        const { service, txReservationRepo, notificationService } = createService([], [], [], []);

        const count = await service.expireDueReservations();

        expect(count).toBe(0);
        expect(txReservationRepo.update).not.toHaveBeenCalled();
        expect(notificationService.create).not.toHaveBeenCalled();
    });

    it('does not double-process a reservation that is both TTL-due and REJECTED-due', async () => {
        const row = { id: 'res-9', orderId: 'order-9', creationMethod: 'manual', status: 'active' };
        const rejectedOrders = [{ id: 'order-9', customFields: { erpStatus: 'REJECTED' } }];
        const { service, txReservationRepo } = createService([row], [], rejectedOrders, [row]);

        const count = await service.expireDueReservations();

        expect(count).toBe(1);
        // Only the rejected-release update runs — never also expired via the TTL branch.
        expect(txReservationRepo.update).not.toHaveBeenCalledWith(
            expect.objectContaining({ id: expect.anything() }),
            expect.objectContaining({ status: 'expired' }),
        );
    });
});
