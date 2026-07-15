import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationErpSyncService } from '../../reservation-erp-sync.service';
import { ReservationService } from '../../reservation.service';

describe('ReservationErpSyncService.handleErpOrderStatus', () => {
    let orderRepo: { findOne: ReturnType<typeof vi.fn> };
    let reservationRepo: { find: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let reservationService: { releaseReservations: ReturnType<typeof vi.fn> };
    let service: ReservationErpSyncService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        orderRepo = { findOne: vi.fn(async () => ({ id: 'order-1', code: 'ORD-1' })) };
        reservationRepo = {
            find: vi.fn(async () => []),
            update: vi.fn(async () => ({ affected: 0 })),
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
        expect(reservationRepo.update).not.toHaveBeenCalled();
        expect(reservationService.releaseReservations).not.toHaveBeenCalled();
    });

    it('sets erpConfirmedAt once for unconfirmed active reservations on RESERVED', async () => {
        reservationRepo.find.mockResolvedValue([
            { id: 'res-1', erpConfirmedAt: null },
            { id: 'res-2', erpConfirmedAt: new Date() },
        ]);

        await service.handleErpOrderStatus(ctx, 'ORD-1', 'RESERVED');

        expect(reservationRepo.update).toHaveBeenCalledTimes(1);
        expect(reservationRepo.update.mock.calls[0][1]).toEqual(
            expect.objectContaining({ erpConfirmedAt: expect.any(Date) }),
        );
    });

    it('does nothing extra when all active reservations are already confirmed', async () => {
        reservationRepo.find.mockResolvedValue([{ id: 'res-1', erpConfirmedAt: new Date() }]);
        await service.handleErpOrderStatus(ctx, 'ORD-1', 'CONFIRMED');
        expect(reservationRepo.update).not.toHaveBeenCalled();
    });

    it('releases active reservations when ERP cancels the order — 1C wins the conflict', async () => {
        reservationService.releaseReservations.mockResolvedValue(2);
        await service.handleErpOrderStatus(ctx, 'ORD-1', 'CANCELLED');
        expect(reservationService.releaseReservations).toHaveBeenCalledWith(ctx, 'order-1');
    });

    it('ignores statuses outside the reservation domain (PENDING/SENT_TO_ERP/ASSEMBLED/SHIPPED/DELIVERED)', async () => {
        for (const status of ['PENDING', 'SENT_TO_ERP', 'ASSEMBLED', 'SHIPPED', 'DELIVERED']) {
            await service.handleErpOrderStatus(ctx, 'ORD-1', status);
        }
        expect(reservationRepo.update).not.toHaveBeenCalled();
        expect(reservationService.releaseReservations).not.toHaveBeenCalled();
    });
});
