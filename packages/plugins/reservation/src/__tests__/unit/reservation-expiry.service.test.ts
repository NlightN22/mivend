import { describe, it, expect, vi } from 'vitest';
import type { DataSource } from 'typeorm';

import { ReservationExpiryService } from '../../reservation-expiry.service';
import type { ReservationPluginOptions } from '../../types';
import { ReservationSettings } from '../../reservation-settings';

describe('ReservationExpiryService.expireDueReservations', () => {
    function createService(
        dueRows: unknown[],
        orderRows: unknown[] = [],
        rejectedOrders: { id: number | string }[] = [],
        rejectedReservations: { orderId: number | string }[] = [],
        settings: ReservationPluginOptions = {},
    ): {
        service: ReservationExpiryService;
        txReservationRepo: {
            createQueryBuilder: ReturnType<typeof vi.fn>;
            update: ReturnType<typeof vi.fn>;
        };
        txOrderRepo: {
            createQueryBuilder: ReturnType<typeof vi.fn>;
            findOne: ReturnType<typeof vi.fn>;
            update: ReturnType<typeof vi.fn>;
        };
        notificationService: { create: ReturnType<typeof vi.fn> };
        eventBus: { publish: ReturnType<typeof vi.fn> };
        cancellation: { cancel: ReturnType<typeof vi.fn> };
    } {
        // Lock must be taken via createQueryBuilder().setLock(); repo.find() would not lock the rows.
        // See the SKIP LOCKED note in reservation-expiry.service.ts for why rows are locked this way.
        let isRejectedQuery = false;
        const reservationQueryBuilder = {
            setLock: vi.fn().mockReturnThis(),
            setOnLocked: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn(function (this: unknown, sql: string) {
                if (sql.includes('orderId IN')) isRejectedQuery = true;
                return this;
            }),
            getMany: vi.fn(async () => {
                const rejected = isRejectedQuery;
                isRejectedQuery = false;
                return rejected ? rejectedReservations : dueRows;
            }),
        };
        const txReservationRepo = {
            createQueryBuilder: vi.fn(() => reservationQueryBuilder),
            update: vi.fn(async () => ({ affected: dueRows.length })),
        };
        const orderQueryBuilder = {
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            setParameter: vi.fn().mockReturnThis(),
            getMany: vi.fn(async () => rejectedOrders),
        };
        const txOrderRepo = {
            createQueryBuilder: vi.fn(() => orderQueryBuilder),
            findOne: vi.fn(async () => orderRows[0] ?? null),
            update: vi.fn(async (x: unknown) => x),
        };
        const manager = {
            getRepository: vi.fn((entity: { name?: string }) =>
                entity?.name === 'Order' ? txOrderRepo : txReservationRepo,
            ),
            query: vi.fn(async () => [{ code: 'REJECTED' }]),
        };
        const dataSource = {
            transaction: vi.fn(async (work: (m: unknown) => unknown) => work(manager)),
            getRepository: vi.fn(() => txReservationRepo),
        } as unknown as DataSource;
        const cancellation = {
            cancel: vi.fn(async () => ({ kind: 'cancelled', eventSent: false })),
        };
        const requestContextService = { create: vi.fn(async () => ({})) };
        const notificationService = { create: vi.fn(async () => ({})) };
        const eventBus = { publish: vi.fn() };
        return {
            service: new ReservationExpiryService(
                dataSource,
                requestContextService as never,
                notificationService as never,
                eventBus as never,
                cancellation as never,
                new ReservationSettings(settings),
            ),
            txReservationRepo,
            txOrderRepo,
            notificationService,
            eventBus,
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
            { requestRegistered: false },
        );
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

    // issue #204: a reservation on an order the ERP rejected gets its own timeout, independent
    // of the reservation's own TTL — notify, then release, same as an explicit manual release.
    it('notifies and releases a reservation once its order has been REJECTED past the deadline', async () => {
        const rejectedOrders = [
            {
                id: 'order-9',
                // erpOrderId simulates a field a concurrent writer could hold — a stale
                // snapshot spread would erase it (#209).
                customFields: {
                    erpStatus: 'REJECTED',
                    reservationState: 'RESERVED',
                    erpOrderId: 'erp-9',
                },
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
        // Only the changed key — never erpStatus/erpOrderId from the stale read above (#209).
        expect(txOrderRepo.update).toHaveBeenCalledWith('order-9', {
            customFields: { reservationState: 'RELEASED' },
        });
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
    });

    it('publishes ReservationReleasedEvent only after the sweep transaction committed', async () => {
        const rejectedOrders = [{ id: 'order-9', customFields: { erpStatus: 'REJECTED' } }];
        const rejectedReservations = [
            { id: 'res-8', orderId: 'order-9', creationMethod: 'manual', status: 'active' },
            { id: 'res-9', orderId: 'order-9', creationMethod: 'manual', status: 'active' },
        ];
        const { service, eventBus, txReservationRepo } = createService(
            [],
            [],
            rejectedOrders,
            rejectedReservations,
        );
        txReservationRepo.update.mockImplementation(async (id: unknown) => {
            if (id === 'res-9') throw new Error('rollback');
            return {};
        });

        await expect(service.expireDueReservations()).rejects.toThrow('rollback');

        expect(eventBus.publish).not.toHaveBeenCalled();
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

    it('uses rejectedOrderReleaseDays, not the reservation default, for the REJECTED deadline', async () => {
        const { service, txOrderRepo } = createService([], [], [{ id: 'order-1' }], [], {
            defaultReservationDays: 30,
            rejectedOrderReleaseDays: 1,
        });
        const before = Date.now();

        await service.expireDueReservations();

        const [, params] = txOrderRepo.createQueryBuilder.mock.results[0].value.andWhere.mock
            .calls[0] as [string, { cutoff: Date }];
        const cutoff = params.cutoff.getTime();
        expect(before - cutoff).toBeLessThan(2 * 24 * 60 * 60 * 1000);
        expect(before - cutoff).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
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
