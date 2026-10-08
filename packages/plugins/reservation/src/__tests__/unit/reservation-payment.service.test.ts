import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationPaymentService } from '../../reservation-payment.service';
import { ReservationService } from '../../reservation.service';
import { ReservationFailureService } from '../../reservation-failure.service';
import { ErpExportDataMissingError, InsufficientStockError } from '../../reservation-errors';

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
    let failureService: { record: ReturnType<typeof vi.fn> };
    let service: ReservationPaymentService;
    const ctx = {} as unknown as RequestContext;
    let autoReserveOnPlacement = false;

    beforeEach(() => {
        autoReserveOnPlacement = false;
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
        failureService = { record: vi.fn(async () => undefined) };
        service = new ReservationPaymentService(
            connection as unknown as TransactionalConnection,
            reservationService as unknown as ReservationService,
            { getSettings: async () => ({ customFields: { autoReserveOnPlacement } }) } as never,
            failureService as unknown as ReservationFailureService,
        );
    });

    describe('autoReserveOnPlacement', () => {
        const placed = () => ({
            id: 'order-1',
            customFields: { reservationState: 'NOT_REQUIRED' },
            payments: [{ method: 'deferred-payment' }],
        });

        it('reserves right away with the non-prepaid TTL when the switch is on', async () => {
            autoReserveOnPlacement = true;
            await service.handleOrderPlaced(ctx, placed() as never);
            expect(reservationService.reserveOrder).toHaveBeenCalledWith(
                ctx,
                'order-1',
                7,
                'auto-trust-rule',
            );
        });

        it('does not reserve when the switch is off', async () => {
            await service.handleOrderPlaced(ctx, placed() as never);
            expect(reservationService.reserveOrder).not.toHaveBeenCalled();
        });

        it('keeps the order awaiting confirmation when stock is short', async () => {
            autoReserveOnPlacement = true;
            reservationService.reserveOrder.mockRejectedValue(new InsufficientStockError([]));
            await expect(
                service.handleOrderPlaced(ctx, placed() as never),
            ).resolves.toBeUndefined();
            expect(reservationService.setOrderReservationState).toHaveBeenCalledWith(
                ctx,
                expect.anything(),
                'AWAITING_CONFIRMATION',
            );
        });

        // Scenario 6 of #199: the switch is read per placement event, never retroactively.
        it('reads the switch at placement: only orders placed while it is on are auto-reserved', async () => {
            const placedAs = (id: string) => ({ ...placed(), id });

            autoReserveOnPlacement = false;
            await service.handleOrderPlaced(ctx, placedAs('order-off') as never);
            autoReserveOnPlacement = true;
            await service.handleOrderPlaced(ctx, placedAs('order-on') as never);
            autoReserveOnPlacement = false;
            await service.handleOrderPlaced(ctx, placedAs('order-off-again') as never);

            expect(reservationService.reserveOrder).toHaveBeenCalledTimes(1);
            expect(reservationService.reserveOrder).toHaveBeenCalledWith(
                ctx,
                'order-on',
                expect.any(Number),
                'auto-trust-rule',
            );
        });

        it('does not auto-reserve an order placed while the switch was off when its event is replayed after the switch is turned on', async () => {
            autoReserveOnPlacement = false;
            await service.handleOrderPlaced(ctx, placed() as never);
            autoReserveOnPlacement = true;

            // The replay sees the state the first delivery wrote: AWAITING_CONFIRMATION.
            await service.handleOrderPlaced(ctx, {
                ...placed(),
                customFields: { reservationState: 'AWAITING_CONFIRMATION' },
            } as never);

            expect(reservationService.reserveOrder).not.toHaveBeenCalled();
        });

        it('records why the reserve failed so staff can see it', async () => {
            autoReserveOnPlacement = true;
            const error = new InsufficientStockError([
                { orderLineId: '1', productVariantId: '9', required: 2, available: 0 },
            ]);
            reservationService.reserveOrder.mockRejectedValue(error);
            await service.handleOrderPlaced(ctx, placed() as never);
            expect(failureService.record).toHaveBeenCalledWith(ctx, 'order-1', error);
        });

        it('treats missing ERP-export data as an expected failure: recorded, not thrown', async () => {
            autoReserveOnPlacement = true;
            const error = new ErpExportDataMissingError(false, [], true);
            reservationService.reserveOrder.mockRejectedValue(error);
            await expect(
                service.handleOrderPlaced(ctx, placed() as never),
            ).resolves.toBeUndefined();
            expect(failureService.record).toHaveBeenCalledWith(ctx, 'order-1', error);
        });

        it('does not record anything when the reserve succeeds', async () => {
            autoReserveOnPlacement = true;
            await service.handleOrderPlaced(ctx, placed() as never);
            expect(failureService.record).not.toHaveBeenCalled();
        });

        it('records an unexpected error and still rethrows it', async () => {
            autoReserveOnPlacement = true;
            const error = new Error('db down');
            reservationService.reserveOrder.mockRejectedValue(error);
            await expect(service.handleOrderPlaced(ctx, placed() as never)).rejects.toThrow(
                'db down',
            );
            expect(failureService.record).toHaveBeenCalledWith(ctx, 'order-1', error);
        });

        it('rethrows unexpected errors instead of swallowing them', async () => {
            autoReserveOnPlacement = true;
            reservationService.reserveOrder.mockRejectedValue(new Error('db down'));
            await expect(service.handleOrderPlaced(ctx, placed() as never)).rejects.toThrow(
                'db down',
            );
        });
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

        it('trusts the stored reservation state over a stale copy on the event', async () => {
            autoReserveOnPlacement = true;
            orderRepo.findOne.mockResolvedValue({
                id: 'order-1',
                customFields: { reservationState: 'RESERVED' },
            });

            await service.handleOrderPlaced(ctx, {
                id: 'order-1',
                customFields: { reservationState: 'NOT_REQUIRED' },
                payments: [{ method: 'deferred-payment' }],
            } as never);

            expect(reservationService.setOrderReservationState).not.toHaveBeenCalled();
            expect(reservationService.reserveOrder).not.toHaveBeenCalled();
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

        it('records the failure for a prepaid order whose reserve fails', async () => {
            paymentMethodRepo.findOne.mockResolvedValue({
                customFields: { paymentClassification: 'PREPAID' },
            });
            const error = new InsufficientStockError([]);
            reservationService.reserveOrder.mockRejectedValue(error);
            const placedOrder = {
                id: 'order-1',
                customFields: {},
                payments: [{ method: 'online-stub' }],
            };

            await service.handlePaymentStateReached(ctx, placedOrder as never);

            expect(failureService.record).toHaveBeenCalledWith(ctx, 'order-1', error);
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
