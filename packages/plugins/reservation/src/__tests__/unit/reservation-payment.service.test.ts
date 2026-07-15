import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationPaymentService } from '../../reservation-payment.service';
import { ReservationService } from '../../reservation.service';
import { InsufficientStockError } from '../../reservation-errors';

function createMockOrderRepo(order: unknown): { findOne: ReturnType<typeof vi.fn> } {
    return { findOne: vi.fn(async () => order) };
}

function createMockPaymentMethodRepo(): { findOne: ReturnType<typeof vi.fn> } {
    return { findOne: vi.fn(async () => null) };
}

describe('ReservationPaymentService', () => {
    let orderRepo: ReturnType<typeof createMockOrderRepo>;
    let paymentMethodRepo: ReturnType<typeof createMockPaymentMethodRepo>;
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let reservationService: {
        reserveOrder: ReturnType<typeof vi.fn>;
        setOrderReservationState: ReturnType<typeof vi.fn>;
    };
    let service: ReservationPaymentService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        orderRepo = createMockOrderRepo(null);
        paymentMethodRepo = createMockPaymentMethodRepo();
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) =>
                entity?.name === 'PaymentMethod' ? paymentMethodRepo : orderRepo,
            ),
        };
        reservationService = {
            reserveOrder: vi.fn(async () => []),
            setOrderReservationState: vi.fn(async () => undefined),
        };
        service = new ReservationPaymentService(
            connection as unknown as TransactionalConnection,
            reservationService as unknown as ReservationService,
        );
    });

    describe('handleOrderPlaced', () => {
        it('sets AWAITING_CONFIRMATION for a non-prepaid order at NOT_REQUIRED', async () => {
            paymentMethodRepo.findOne.mockResolvedValue({
                customFields: { paymentClassification: 'OFFLINE_TERMS' },
            });
            const placedOrder = {
                id: 'order-1',
                customFields: { reservationState: 'NOT_REQUIRED' },
                payments: [{ method: 'offline-terms' }],
            };

            await service.handleOrderPlaced(ctx, placedOrder as never);

            expect(reservationService.setOrderReservationState).toHaveBeenCalledWith(
                ctx,
                placedOrder,
                'AWAITING_CONFIRMATION',
            );
        });

        it('is a no-op for PREPAID orders', async () => {
            paymentMethodRepo.findOne.mockResolvedValue({
                customFields: { paymentClassification: 'PREPAID' },
            });
            const placedOrder = {
                id: 'order-1',
                customFields: { reservationState: 'NOT_REQUIRED' },
                payments: [{ method: 'online-stub' }],
            };

            await service.handleOrderPlaced(ctx, placedOrder as never);

            expect(reservationService.setOrderReservationState).not.toHaveBeenCalled();
        });

        it('does not clobber a state other than NOT_REQUIRED', async () => {
            const placedOrder = {
                id: 'order-1',
                customFields: { reservationState: 'RESERVED' },
                payments: [],
            };

            await service.handleOrderPlaced(ctx, placedOrder as never);

            expect(reservationService.setOrderReservationState).not.toHaveBeenCalled();
        });

        it('treats an unset payment classification as non-prepaid', async () => {
            paymentMethodRepo.findOne.mockResolvedValue(null);
            const placedOrder = {
                id: 'order-1',
                customFields: { reservationState: 'NOT_REQUIRED' },
                payments: [{ method: 'offline-terms' }],
            };

            await service.handleOrderPlaced(ctx, placedOrder as never);

            expect(reservationService.setOrderReservationState).toHaveBeenCalled();
        });
    });

    describe('handlePaymentStateReached', () => {
        it('auto-reserves a PREPAID order using the payment method TTL override', async () => {
            paymentMethodRepo.findOne.mockResolvedValue({
                customFields: { paymentClassification: 'PREPAID', reservationTtlDays: 45 },
            });
            const placedOrder = {
                id: 'order-1',
                customFields: {},
                payments: [{ method: 'online-stub' }],
            };

            await service.handlePaymentStateReached(ctx, placedOrder as never);

            expect(reservationService.reserveOrder).toHaveBeenCalledWith(
                ctx,
                'order-1',
                45,
                'auto-prepaid',
            );
        });

        it('falls back to the 30-day PREPAID default when no override is set', async () => {
            paymentMethodRepo.findOne.mockResolvedValue({
                customFields: { paymentClassification: 'PREPAID' },
            });
            const placedOrder = {
                id: 'order-1',
                customFields: {},
                payments: [{ method: 'online-stub' }],
            };

            await service.handlePaymentStateReached(ctx, placedOrder as never);

            expect(reservationService.reserveOrder).toHaveBeenCalledWith(
                ctx,
                'order-1',
                30,
                'auto-prepaid',
            );
        });

        it('is a no-op for non-PREPAID classifications', async () => {
            paymentMethodRepo.findOne.mockResolvedValue({
                customFields: { paymentClassification: 'OFFLINE_TERMS' },
            });
            const placedOrder = {
                id: 'order-1',
                customFields: {},
                payments: [{ method: 'offline-terms' }],
            };

            await service.handlePaymentStateReached(ctx, placedOrder as never);

            expect(reservationService.reserveOrder).not.toHaveBeenCalled();
        });

        it('swallows InsufficientStockError instead of throwing', async () => {
            paymentMethodRepo.findOne.mockResolvedValue({
                customFields: { paymentClassification: 'PREPAID' },
            });
            reservationService.reserveOrder.mockRejectedValue(new InsufficientStockError([]));
            const placedOrder = {
                id: 'order-1',
                customFields: {},
                payments: [{ method: 'online-stub' }],
            };

            await expect(
                service.handlePaymentStateReached(ctx, placedOrder as never),
            ).resolves.toBeUndefined();
        });
    });
});
