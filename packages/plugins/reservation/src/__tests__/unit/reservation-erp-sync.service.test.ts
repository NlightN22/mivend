import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationErpSyncService } from '../../reservation-erp-sync.service';
import { ReservationService } from '../../reservation.service';

describe('ReservationErpSyncService.handleErpOrderStatus', () => {
    let orderRepo: { findOne: ReturnType<typeof vi.fn> };
    let reservationRepo: { find: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let reservationService: { releaseReservations: ReturnType<typeof vi.fn> };
    let service: ReservationErpSyncService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        orderRepo = { findOne: vi.fn(async () => ({ id: 'order-1', code: 'ORD-1' })) };
        reservationRepo = {
            find: vi.fn(async () => []),
            save: vi.fn(async (rows: unknown) => rows),
        };
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) =>
                entity?.name === 'Order' ? orderRepo : reservationRepo,
            ),
        };
        reservationService = { releaseReservations: vi.fn(async () => 0) };
        service = new ReservationErpSyncService(
            connection as unknown as TransactionalConnection,
            reservationService as unknown as ReservationService,
        );
    });

    it('is a no-op when the order cannot be found', async () => {
        orderRepo.findOne.mockResolvedValue(null);
        await service.handleErpOrderStatus(ctx, 'ORD-1', 'RESERVED');
        expect(reservationRepo.save).not.toHaveBeenCalled();
        expect(reservationService.releaseReservations).not.toHaveBeenCalled();
    });

    it.each(['RESERVED', 'CONFIRMED', 'SHIPPED', 'DELIVERED'])(
        'releases active reservations on %s — never held all the way to shipment',
        async status => {
            reservationRepo.find.mockResolvedValue([
                { id: 'res-1', status: 'active', erpConfirmedAt: null },
            ]);

            await service.handleErpOrderStatus(ctx, 'ORD-1', status);

            expect(reservationRepo.save).toHaveBeenCalledWith([
                expect.objectContaining({
                    id: 'res-1',
                    status: 'released',
                    releasedAt: expect.any(Date),
                    erpReleaseOperationId: expect.any(String),
                    erpConfirmedAt: expect.any(Date),
                }),
            ]);
            // Must NOT go through releaseReservations — that publishes
            // ReservationReleasedEvent, which would send 1C an outbound "please release this
            // reservation" command in response to its own confirmation/shipment notice.
            expect(reservationService.releaseReservations).not.toHaveBeenCalled();
        },
    );

    it('preserves an already-set erpConfirmedAt rather than overwriting it', async () => {
        const confirmedAt = new Date('2026-01-01T00:00:00Z');
        reservationRepo.find.mockResolvedValue([
            { id: 'res-1', status: 'active', erpConfirmedAt: confirmedAt },
        ]);
        await service.handleErpOrderStatus(ctx, 'ORD-1', 'SHIPPED');
        expect(reservationRepo.save).toHaveBeenCalledWith([
            expect.objectContaining({ erpConfirmedAt: confirmedAt }),
        ]);
    });

    it('is idempotent — a repeat callback with nothing left active is a no-op', async () => {
        reservationRepo.find.mockResolvedValue([]);
        await service.handleErpOrderStatus(ctx, 'ORD-1', 'CONFIRMED');
        expect(reservationRepo.save).not.toHaveBeenCalled();
    });

    it('releases active reservations when ERP cancels the order — 1C wins the conflict', async () => {
        reservationService.releaseReservations.mockResolvedValue(2);
        await service.handleErpOrderStatus(ctx, 'ORD-1', 'CANCELLED');
        expect(reservationService.releaseReservations).toHaveBeenCalledWith(ctx, 'order-1');
    });

    it('ignores statuses outside the reservation domain (PENDING/SENT_TO_ERP/ASSEMBLED)', async () => {
        for (const status of ['PENDING', 'SENT_TO_ERP', 'ASSEMBLED']) {
            await service.handleErpOrderStatus(ctx, 'ORD-1', status);
        }
        expect(reservationRepo.save).not.toHaveBeenCalled();
        expect(reservationService.releaseReservations).not.toHaveBeenCalled();
    });
});
