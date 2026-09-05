import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationWriteOffSyncService } from '../../reservation-write-off-sync.service';
import { ReservationReconciliationIssueService } from '../../reservation-reconciliation-issue.service';
import { ReservationService } from '../../reservation.service';

describe('ReservationWriteOffSyncService.handleOrderRegistrationResult', () => {
    let orderRepo: { findOne: ReturnType<typeof vi.fn> };
    let reservationRepo: {
        find: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
    };
    let rawQuery: ReturnType<typeof vi.fn>;
    let connection: {
        getRepository: ReturnType<typeof vi.fn>;
        rawConnection: { query: ReturnType<typeof vi.fn> };
    };
    let reservationService: { setOrderReservationState: ReturnType<typeof vi.fn> };
    let reconciliationIssueService: { report: ReturnType<typeof vi.fn> };
    let service: ReservationWriteOffSyncService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        orderRepo = { findOne: vi.fn(async () => ({ id: 'order-1' })) };
        reservationRepo = {
            find: vi.fn(async () => []),
            save: vi.fn(async (rows: unknown[]) => rows),
            count: vi.fn(async () => 0),
        };
        rawQuery = vi.fn(async () => [{ id: 'order-1' }]);
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) =>
                entity?.name === 'Order' ? orderRepo : reservationRepo,
            ),
            rawConnection: { query: rawQuery },
        };
        reservationService = { setOrderReservationState: vi.fn(async () => undefined) };
        reconciliationIssueService = { report: vi.fn(async () => undefined) };
        service = new ReservationWriteOffSyncService(
            connection as unknown as TransactionalConnection,
            reservationService as unknown as ReservationService,
            reconciliationIssueService as unknown as ReservationReconciliationIssueService,
        );
    });

    it('is a no-op when orderEntityId is missing (e.g. a rejected result with no order created)', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: null,
            rejected: true,
            reservedLines: [],
        });
        expect(rawQuery).not.toHaveBeenCalled();
        expect(reservationRepo.find).not.toHaveBeenCalled();
    });

    it('is a no-op when no Order is found for orderEntityId', async () => {
        rawQuery.mockResolvedValue([]);
        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [],
        });
        expect(reservationRepo.find).not.toHaveBeenCalled();
    });

    it('never releases on a rejected result, leaving reservations active', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: true,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
        });
        expect(reservationRepo.find).not.toHaveBeenCalled();
        expect(reservationRepo.save).not.toHaveBeenCalled();
    });

    it('releases a reservation whose quantity matches the confirmed erp quantity, without an event', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 5,
                status: 'active',
            },
        ]);
        reservationRepo.count.mockResolvedValue(0);

        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
        });

        expect(reservationRepo.save).toHaveBeenCalledTimes(1);
        const [saved] = reservationRepo.save.mock.calls[0];
        expect(saved).toHaveLength(1);
        expect(saved[0]).toEqual(
            expect.objectContaining({ status: 'released', releasedAt: expect.any(Date) }),
        );
        expect(reconciliationIssueService.report).not.toHaveBeenCalled();
        expect(reservationService.setOrderReservationState).toHaveBeenCalledWith(
            ctx,
            { id: 'order-1' },
            'RELEASED',
        );
    });

    it('reports a discrepancy and leaves the reservation active on a quantity mismatch', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 5,
                status: 'active',
            },
        ]);

        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 3 }],
        });

        expect(reservationRepo.save).not.toHaveBeenCalled();
        expect(reconciliationIssueService.report).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                orderId: 'order-1',
                productVariantId: 'v-1',
                localQuantity: 5,
                erpQuantity: 3,
                orderEntityId: 'erp-order-1',
            }),
        );
        expect(reservationService.setOrderReservationState).not.toHaveBeenCalled();
    });

    it('leaves a reservation active whose variant is not confirmed in this result at all', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 5,
                status: 'active',
            },
        ]);

        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [],
        });

        expect(reservationRepo.save).not.toHaveBeenCalled();
        expect(reconciliationIssueService.report).not.toHaveBeenCalled();
    });

    it('aggregates two reservations for the same variant against one confirmed quantity', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 2,
                status: 'active',
            },
            {
                id: 'res-2',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 3,
                status: 'active',
            },
        ]);
        reservationRepo.count.mockResolvedValue(0);

        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
        });

        expect(reservationRepo.save).toHaveBeenCalledTimes(1);
        expect(reservationRepo.save.mock.calls[0][0]).toHaveLength(2);
    });

    it('only flips the order to RELEASED once no active reservations remain', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 5,
                status: 'active',
            },
        ]);
        reservationRepo.count.mockResolvedValue(1);

        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
        });

        expect(reservationRepo.save).toHaveBeenCalledTimes(1);
        expect(reservationService.setOrderReservationState).not.toHaveBeenCalled();
    });

    it('is idempotent: a repeat with no remaining active reservations is a no-op', async () => {
        reservationRepo.find.mockResolvedValue([]);

        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
        });

        expect(reservationRepo.save).not.toHaveBeenCalled();
        expect(reconciliationIssueService.report).not.toHaveBeenCalled();
    });
});
