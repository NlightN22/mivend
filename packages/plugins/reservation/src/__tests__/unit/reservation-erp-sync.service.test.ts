import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, StockLevelService, TransactionalConnection } from '@vendure/core';

import { ReservationErpSyncService } from '../../reservation-erp-sync.service';
import { ReservationService } from '../../reservation.service';

describe('ReservationErpSyncService.handleErpOrderStatus', () => {
    let orderRepo: { findOne: ReturnType<typeof vi.fn> };
    let reservationRepo: { find: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let reservationService: { releaseReservations: ReturnType<typeof vi.fn> };
    let stockLevelService: { updateStockAllocatedForLocation: ReturnType<typeof vi.fn> };
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
        stockLevelService = { updateStockAllocatedForLocation: vi.fn() };
        service = new ReservationErpSyncService(
            connection as unknown as TransactionalConnection,
            reservationService as unknown as ReservationService,
            stockLevelService as unknown as StockLevelService,
        );
    });

    it('is a no-op when the order cannot be found', async () => {
        orderRepo.findOne.mockResolvedValue(null);
        await service.handleErpOrderStatus(ctx, 'ORD-1', 'RESERVED');
        expect(reservationRepo.save).not.toHaveBeenCalled();
        expect(reservationService.releaseReservations).not.toHaveBeenCalled();
    });

    it('on RESERVED, converts each unconfirmed active reservation into stockAllocated and moves it to allocated', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                status: 'active',
                erpConfirmedAt: null,
                productVariantId: 'variant-1',
                stockLocationId: 'loc-1',
                quantity: 3,
            },
            {
                id: 'res-2',
                status: 'active',
                erpConfirmedAt: new Date(),
                productVariantId: 'variant-2',
                stockLocationId: 'loc-1',
                quantity: 5,
            },
        ]);

        await service.handleErpOrderStatus(ctx, 'ORD-1', 'RESERVED');

        // Only the unconfirmed row (res-1) is converted — res-2 was already confirmed earlier.
        expect(stockLevelService.updateStockAllocatedForLocation).toHaveBeenCalledTimes(1);
        expect(stockLevelService.updateStockAllocatedForLocation).toHaveBeenCalledWith(
            ctx,
            'variant-1',
            'loc-1',
            3,
        );
        expect(reservationRepo.save).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 'res-1',
                status: 'allocated',
                erpConfirmedAt: expect.any(Date),
            }),
        ]);
    });

    it('does nothing extra when all active reservations are already confirmed', async () => {
        reservationRepo.find.mockResolvedValue([
            { id: 'res-1', status: 'active', erpConfirmedAt: new Date() },
        ]);
        await service.handleErpOrderStatus(ctx, 'ORD-1', 'CONFIRMED');
        expect(stockLevelService.updateStockAllocatedForLocation).not.toHaveBeenCalled();
        expect(reservationRepo.save).not.toHaveBeenCalled();
    });

    it('on SHIPPED, decrements stockAllocated for each allocated reservation and releases it — without going through ReservationService.releaseReservations', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                status: 'allocated',
                productVariantId: 'variant-1',
                stockLocationId: 'loc-1',
                quantity: 3,
            },
        ]);

        await service.handleErpOrderStatus(ctx, 'ORD-1', 'SHIPPED');

        expect(stockLevelService.updateStockAllocatedForLocation).toHaveBeenCalledWith(
            ctx,
            'variant-1',
            'loc-1',
            -3,
        );
        expect(reservationRepo.save).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 'res-1',
                status: 'released',
                releasedAt: expect.any(Date),
                erpReleaseOperationId: expect.any(String),
            }),
        ]);
        // Must NOT go through releaseReservations — that publishes ReservationReleasedEvent,
        // which would send 1C an outbound "please release this reservation" command right after
        // it told us the goods shipped (see the service's own doc comment).
        expect(reservationService.releaseReservations).not.toHaveBeenCalled();
    });

    it('on DELIVERED, same as SHIPPED', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                status: 'allocated',
                productVariantId: 'variant-1',
                stockLocationId: 'loc-1',
                quantity: 2,
            },
        ]);
        await service.handleErpOrderStatus(ctx, 'ORD-1', 'DELIVERED');
        expect(stockLevelService.updateStockAllocatedForLocation).toHaveBeenCalledWith(
            ctx,
            'variant-1',
            'loc-1',
            -2,
        );
    });

    it('SHIPPED is idempotent — a repeat callback with nothing left allocated is a no-op', async () => {
        reservationRepo.find.mockResolvedValue([]);
        await service.handleErpOrderStatus(ctx, 'ORD-1', 'SHIPPED');
        expect(stockLevelService.updateStockAllocatedForLocation).not.toHaveBeenCalled();
        expect(reservationRepo.save).not.toHaveBeenCalled();
    });

    it('releases active/allocated reservations when ERP cancels the order — 1C wins the conflict', async () => {
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
        expect(stockLevelService.updateStockAllocatedForLocation).not.toHaveBeenCalled();
    });
});
