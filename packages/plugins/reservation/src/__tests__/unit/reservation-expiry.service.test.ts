import { describe, it, expect, vi } from 'vitest';

import { ReservationExpiryService } from '../../reservation-expiry.service';

describe('ReservationExpiryService.expireDueReservations', () => {
    function createService(
        dueRows: unknown[],
        orderRows: unknown[] = [],
        rejectedReleased = 0,
    ): {
        service: ReservationExpiryService;
        txReservationRepo: {
            createQueryBuilder: ReturnType<typeof vi.fn>;
            update: ReturnType<typeof vi.fn>;
        };
        txOrderRepo: {
            findOne: ReturnType<typeof vi.fn>;
            update: ReturnType<typeof vi.fn>;
        };
        notificationService: { create: ReturnType<typeof vi.fn> };
        rejectedRelease: { releaseDue: ReturnType<typeof vi.fn> };
        cancellation: { cancel: ReturnType<typeof vi.fn> };
    } {
        // Lock must be taken via createQueryBuilder().setLock(); repo.find() would not lock the rows.
        const reservationQueryBuilder = {
            setLock: vi.fn().mockReturnThis(),
            setOnLocked: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            getMany: vi.fn(async () => dueRows),
        };
        const txReservationRepo = {
            createQueryBuilder: vi.fn(() => reservationQueryBuilder),
            update: vi.fn(async () => ({ affected: dueRows.length })),
        };
        const txOrderRepo = {
            findOne: vi.fn(async () => orderRows[0] ?? null),
            update: vi.fn(async (x: unknown) => x),
        };
        const connection = {
            withTransaction: vi.fn(async (c: unknown, work: (c: unknown) => unknown) => work(c)),
            getRepository: vi.fn((_c: unknown, entity: { name?: string } | string) =>
                entity === 'Channel'
                    ? { query: vi.fn(async () => []) }
                    : typeof entity !== 'string' && entity?.name === 'Order'
                      ? txOrderRepo
                      : txReservationRepo,
            ),
        };
        const cancellation = {
            cancel: vi.fn(async () => ({ kind: 'cancelled', eventSent: false })),
        };
        const requestContextService = { create: vi.fn(async () => ({})) };
        const notificationService = { create: vi.fn(async () => ({})) };
        const rejectedRelease = { releaseDue: vi.fn(async () => rejectedReleased) };
        return {
            service: new ReservationExpiryService(
                connection as never,
                requestContextService as never,
                notificationService as never,
                cancellation as never,
                rejectedRelease as never,
            ),
            txReservationRepo,
            txOrderRepo,
            notificationService,
            rejectedRelease,
            cancellation,
        };
    }

    it('cancels each due order once through the cancellation service, never touching the order itself', async () => {
        const dueRows = [
            { id: 'res-1', orderId: 'order-1', creationMethod: 'manual' },
            { id: 'res-2', orderId: 'order-1', creationMethod: 'manual' },
            { id: 'res-3', orderId: 'order-2', creationMethod: 'manual' },
        ];
        const { service, txOrderRepo, cancellation } = createService(dueRows);

        const count = await service.expireDueReservations();

        expect(count).toBe(3);
        expect(cancellation.cancel).toHaveBeenCalledTimes(2);
        expect(cancellation.cancel).toHaveBeenCalledWith(
            expect.anything(),
            'order-1',
            'reserve-expired',
            { requestRegistered: false, reserveDueBy: expect.any(Date) },
        );
        expect(txOrderRepo.update).not.toHaveBeenCalled();
    });

    it('leaves an order alone when the cancel finds its reserve no longer due (extended since the read)', async () => {
        const dueRows = [{ id: 'res-1', orderId: 'order-1', creationMethod: 'manual' }];
        const { service, txReservationRepo, txOrderRepo, cancellation } = createService(dueRows);
        cancellation.cancel.mockResolvedValue({ kind: 'reserve-not-due' });

        const count = await service.expireDueReservations();

        expect(count).toBe(0);
        expect(txReservationRepo.update).not.toHaveBeenCalled();
        expect(txOrderRepo.update).not.toHaveBeenCalled();
    });

    it('returns an order that cannot be cancelled automatically to AWAITING_CONFIRMATION, writing only the changed key (#209)', async () => {
        const dueRows = [{ id: 'res-1', orderId: 'order-1', creationMethod: 'manual' }];
        const { service, txReservationRepo, txOrderRepo, cancellation } = createService(dueRows, [
            {
                id: 'order-1',
                customFields: {
                    reservationState: 'RESERVED',
                    erpStatus: 'CONFIRMED',
                    erpOrderId: 'erp-1',
                },
            },
        ]);
        cancellation.cancel.mockResolvedValue({ kind: 'not-cancellable', reason: 'paid' });

        const count = await service.expireDueReservations();

        expect(count).toBe(1);
        expect(txReservationRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'active' }),
            { status: 'expired' },
        );
        expect(txOrderRepo.update).toHaveBeenCalledWith('order-1', {
            customFields: { reservationState: 'AWAITING_CONFIRMATION' },
        });
    });

    it('keeps the #204 rule for a REJECTED order at the deadline: back to the queue, no cancel', async () => {
        const dueRows = [{ id: 'res-1', orderId: 'order-1', creationMethod: 'manual' }];
        const { service, cancellation, txOrderRepo } = createService(dueRows, [
            {
                id: 'order-1',
                customFields: { reservationState: 'RESERVED', erpStatus: 'REJECTED' },
            },
        ]);
        cancellation.cancel.mockResolvedValue({
            kind: 'not-cancellable',
            reason: 'registration-rejected',
        });

        await service.expireDueReservations();

        expect(txOrderRepo.update).toHaveBeenCalledWith('order-1', {
            customFields: { reservationState: 'AWAITING_CONFIRMATION' },
        });
    });

    it('takes no local action for a registered order and flags it only past the grace period', async () => {
        const recent = {
            id: 'res-1',
            orderId: 'order-1',
            creationMethod: 'manual',
            expiresAt: new Date(Date.now() - 60_000),
        };
        const old = {
            id: 'res-2',
            orderId: 'order-2',
            creationMethod: 'manual',
            expiresAt: new Date(Date.now() - 2 * 86_400_000),
        };
        const { service, cancellation, txReservationRepo, notificationService } = createService([
            recent,
            old,
        ]);
        cancellation.cancel.mockResolvedValue({ kind: 'left-to-erp' });

        const count = await service.expireDueReservations();

        expect(count).toBe(0);
        expect(txReservationRepo.update).toHaveBeenCalledTimes(1);
        expect(txReservationRepo.update).toHaveBeenCalledWith(
            { id: 'res-2', status: 'active' },
            { interventionFlaggedAt: expect.any(Date) },
        );
        expect(notificationService.create).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ sourceType: 'reservation-erp-owned', sourceId: 'res-2' }),
        );
    });

    it('keeps cancelling the other orders when one cancel fails, then fails the sweep', async () => {
        const dueRows = [
            { id: 'res-1', orderId: 'order-1', creationMethod: 'manual' },
            { id: 'res-2', orderId: 'order-2', creationMethod: 'manual' },
        ];
        const { service, cancellation } = createService(dueRows);
        cancellation.cancel
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce({ kind: 'cancelled', eventSent: false });

        await expect(service.expireDueReservations()).rejects.toThrow('boom');

        expect(cancellation.cancel).toHaveBeenCalledTimes(2);
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

    it('marks nothing when a notification fails, and the next sweep sends it', async () => {
        const dueRows = [
            {
                id: 'res-1',
                orderId: 'order-1',
                creationMethod: 'auto-prepaid',
                interventionFlaggedAt: null,
                expiresAt: new Date('2026-01-01'),
            },
        ];
        const { service, txReservationRepo, notificationService } = createService(dueRows);
        notificationService.create.mockRejectedValueOnce(new Error('notify down'));

        await service.expireDueReservations();
        expect(txReservationRepo.update).not.toHaveBeenCalled();

        await service.expireDueReservations();
        expect(notificationService.create).toHaveBeenCalledTimes(2);
        expect(txReservationRepo.update).toHaveBeenCalledTimes(1);
    });

    it('keeps flagging other ERP-owned reservations when one notification fails', async () => {
        const old = new Date(Date.now() - 2 * 86_400_000);
        const dueRows = [
            { id: 'res-1', orderId: 'order-1', creationMethod: 'manual', expiresAt: old },
            { id: 'res-2', orderId: 'order-2', creationMethod: 'manual', expiresAt: old },
        ];
        const { service, cancellation, txReservationRepo, notificationService } =
            createService(dueRows);
        cancellation.cancel.mockResolvedValue({ kind: 'left-to-erp' });
        notificationService.create.mockRejectedValueOnce(new Error('notify down'));

        await expect(service.expireDueReservations()).resolves.toBe(0);

        expect(notificationService.create).toHaveBeenCalledTimes(2);
        expect(txReservationRepo.update).toHaveBeenCalledTimes(1);
        expect(txReservationRepo.update).toHaveBeenCalledWith(
            { id: 'res-2', status: 'active' },
            expect.anything(),
        );
    });

    it('counts the rejected-order releases and runs them before the deadline sweep', async () => {
        const { service, rejectedRelease, txReservationRepo } = createService([], [], 2);

        expect(await service.expireDueReservations()).toBe(2);

        expect(rejectedRelease.releaseDue).toHaveBeenCalledTimes(1);
        expect(txReservationRepo.update).not.toHaveBeenCalled();
    });
});
