import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationPaymentService } from '../../reservation-payment.service';
import { ReservationService } from '../../reservation.service';
import { ReservationFailureService } from '../../reservation-failure.service';
import { ErpExportDataMissingError, InsufficientStockError } from '../../reservation-errors';
import { ReservationSettings } from '../../reservation-settings';

function createMockOrderRepo(order: unknown): {
    findOne: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
} {
    const locked = { id: 'order-1', customFields: { reservationState: 'NOT_REQUIRED' } };
    const builder = {
        setLock: () => builder,
        where: () => builder,
        getOne: async () => locked,
    };
    return {
        findOne: vi.fn(async () => order),
        update: vi.fn(async () => undefined),
        createQueryBuilder: vi.fn(() => builder),
    };
}

function createMockPaymentRepo(): { find: ReturnType<typeof vi.fn> } {
    return { find: vi.fn(async () => []) };
}

const withPlacement = (
    route: string,
    state = 'Authorized',
    reserveDays: number | null = null,
): { method: string; state: string; metadata: object } => ({
    method: 'cash',
    state,
    metadata: { placement: { route, countsAgainstLimit: true, reserveDays } },
});

describe('ReservationPaymentService', () => {
    let orderRepo: ReturnType<typeof createMockOrderRepo>;
    let paymentRepo: ReturnType<typeof createMockPaymentRepo>;
    let reservationRepo: { count: ReturnType<typeof vi.fn> };
    let connection: {
        getRepository: ReturnType<typeof vi.fn>;
        withTransaction: ReturnType<typeof vi.fn>;
    };
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
        paymentRepo = createMockPaymentRepo();
        reservationRepo = { count: vi.fn(async () => 0) };
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) =>
                entity?.name === 'Payment'
                    ? paymentRepo
                    : entity?.name === 'Reservation'
                      ? reservationRepo
                      : orderRepo,
            ),
            withTransaction: vi.fn(async (c: unknown, work: (txCtx: unknown) => Promise<void>) =>
                work(c),
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
            new ReservationSettings({}),
        );
    });

    describe('autoReserveOnPlacement', () => {
        const placed = () => ({
            id: 'order-1',
            customFields: { reservationState: 'NOT_REQUIRED' },
            payments: [],
        });

        it('reserves right away with the non-prepaid TTL when the switch is on', async () => {
            autoReserveOnPlacement = true;
            await service.handleOrderPlaced(ctx, placed() as never);
            expect(reservationService.reserveOrder).toHaveBeenCalledWith(
                ctx,
                'order-1',
                3,
                'auto-trust-rule',
            );
        });

        it('leaves an order flagged creditLimitExceeded awaiting a manager even with the switch on', async () => {
            autoReserveOnPlacement = true;
            paymentRepo.find.mockResolvedValue([
                { method: 'offline-terms', metadata: { public: { creditLimitExceeded: true } } },
            ]);
            await service.handleOrderPlaced(ctx, placed() as never);
            expect(reservationService.reserveOrder).not.toHaveBeenCalled();
            expect(orderRepo.update).toHaveBeenCalledWith(
                'order-1',
                expect.objectContaining({
                    customFields: expect.objectContaining({
                        reservationState: 'AWAITING_CONFIRMATION',
                    }),
                }),
            );
        });

        it('marks RESERVED, not AWAITING_CONFIRMATION, when a manual confirm already holds an active reservation', async () => {
            reservationRepo.count.mockResolvedValue(1);
            await service.handleOrderPlaced(ctx, placed() as never);
            expect(orderRepo.update).toHaveBeenCalledWith(
                'order-1',
                expect.objectContaining({
                    customFields: expect.objectContaining({ reservationState: 'RESERVED' }),
                }),
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
            expect(orderRepo.update).toHaveBeenCalledWith(
                'order-1',
                expect.objectContaining({
                    customFields: expect.objectContaining({
                        reservationState: 'AWAITING_CONFIRMATION',
                    }),
                }),
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
        const placedOrder = (): object => ({
            id: 'order-1',
            customFields: { reservationState: 'NOT_REQUIRED' },
            payments: [],
        });
        const awaiting = expect.objectContaining({
            customFields: expect.objectContaining({ reservationState: 'AWAITING_CONFIRMATION' }),
        });

        it('queues an order without a placement route for a manager', async () => {
            await service.handleOrderPlaced(ctx, placedOrder() as never);
            expect(orderRepo.update).toHaveBeenCalledWith('order-1', awaiting);
            expect(reservationService.reserveOrder).not.toHaveBeenCalled();
        });

        it('reserves an erp-now order at once with the standard TTL', async () => {
            paymentRepo.find.mockResolvedValue([withPlacement('erp-now')]);
            await service.handleOrderPlaced(ctx, placedOrder() as never);
            expect(orderRepo.update).toHaveBeenCalledWith('order-1', awaiting);
            expect(reservationService.reserveOrder).toHaveBeenCalledWith(
                ctx,
                'order-1',
                3,
                'auto-trust-rule',
            );
        });

        it('uses the short prepayment reserve stored at placement', async () => {
            paymentRepo.find.mockResolvedValue([withPlacement('erp-now', 'Authorized', 3)]);
            await service.handleOrderPlaced(ctx, placedOrder() as never);
            expect(reservationService.reserveOrder).toHaveBeenCalledWith(
                ctx,
                'order-1',
                3,
                'auto-trust-rule',
            );
        });

        it('erp-now reserves even when the global auto-reserve switch is off', async () => {
            autoReserveOnPlacement = false;
            paymentRepo.find.mockResolvedValue([withPlacement('erp-now')]);
            await service.handleOrderPlaced(ctx, placedOrder() as never);
            expect(reservationService.reserveOrder).toHaveBeenCalledTimes(1);
        });

        it('keeps a manager-confirmation order waiting even with the switch on', async () => {
            autoReserveOnPlacement = true;
            paymentRepo.find.mockResolvedValue([withPlacement('manager-confirmation')]);
            await service.handleOrderPlaced(ctx, placedOrder() as never);
            expect(orderRepo.update).toHaveBeenCalledWith('order-1', awaiting);
            expect(reservationService.reserveOrder).not.toHaveBeenCalled();
        });

        it('leaves an after-payment (card) order untouched', async () => {
            paymentRepo.find.mockResolvedValue([withPlacement('after-payment')]);
            await service.handleOrderPlaced(ctx, placedOrder() as never);
            expect(orderRepo.update).not.toHaveBeenCalled();
            expect(reservationService.reserveOrder).not.toHaveBeenCalled();
        });

        it('trusts the stored reservation state over a stale copy on the event', async () => {
            paymentRepo.find.mockResolvedValue([withPlacement('erp-now')]);
            orderRepo.findOne.mockResolvedValue({
                id: 'order-1',
                customFields: { reservationState: 'RESERVED' },
            });
            await service.handleOrderPlaced(ctx, placedOrder() as never);
            expect(orderRepo.update).not.toHaveBeenCalled();
            expect(reservationService.reserveOrder).not.toHaveBeenCalled();
        });

        it('does not clobber a state other than NOT_REQUIRED', async () => {
            await service.handleOrderPlaced(ctx, {
                id: 'order-1',
                customFields: { reservationState: 'RESERVED' },
                payments: [],
            } as never);
            expect(orderRepo.update).not.toHaveBeenCalled();
        });

        it('records an erp-now reserve failure and leaves the order awaiting confirmation', async () => {
            paymentRepo.find.mockResolvedValue([withPlacement('erp-now')]);
            const error = new InsufficientStockError([]);
            reservationService.reserveOrder.mockRejectedValue(error);
            await expect(
                service.handleOrderPlaced(ctx, placedOrder() as never),
            ).resolves.toBeUndefined();
            expect(failureService.record).toHaveBeenCalledWith(ctx, 'order-1', error);
        });
    });

    describe('handlePaymentStateReached', () => {
        const order = { id: 'order-1', customFields: {}, payments: [] };

        it('reserves a card order once its payment is Settled, with the prepaid TTL', async () => {
            paymentRepo.find.mockResolvedValue([withPlacement('after-payment', 'Settled')]);
            await service.handlePaymentStateReached(ctx, order as never);
            expect(reservationService.reserveOrder).toHaveBeenCalledWith(
                ctx,
                'order-1',
                30,
                'auto-prepaid',
            );
        });

        it('waits while a card payment is only Authorized', async () => {
            paymentRepo.find.mockResolvedValue([withPlacement('after-payment', 'Authorized')]);
            await service.handlePaymentStateReached(ctx, order as never);
            expect(reservationService.reserveOrder).not.toHaveBeenCalled();
        });

        it.each(['erp-now', 'manager-confirmation'])(
            'does not reserve a %s order on payment',
            async route => {
                paymentRepo.find.mockResolvedValue([withPlacement(route, 'Settled')]);
                await service.handlePaymentStateReached(ctx, order as never);
                expect(reservationService.reserveOrder).not.toHaveBeenCalled();
            },
        );

        it('takes the route of the latest live payment, not a stale or declined attempt', async () => {
            const at = (iso: string): Date => new Date(iso);
            paymentRepo.find.mockResolvedValue([
                { ...withPlacement('erp-now', 'Cancelled'), id: 1, createdAt: at('2026-01-01') },
                {
                    ...withPlacement('after-payment', 'Settled'),
                    id: 2,
                    createdAt: at('2026-01-02'),
                },
                { ...withPlacement('erp-now', 'Declined'), id: 3, createdAt: at('2026-01-03') },
            ]);
            await service.handlePaymentStateReached(ctx, order as never);
            expect(reservationService.reserveOrder).toHaveBeenCalledTimes(1);
        });

        it('is a no-op for payments without a placement route', async () => {
            paymentRepo.find.mockResolvedValue([{ method: 'offline-terms', state: 'Settled' }]);
            await service.handlePaymentStateReached(ctx, order as never);
            expect(reservationService.reserveOrder).not.toHaveBeenCalled();
        });

        it('records the failure for a card order whose reserve fails, without throwing', async () => {
            paymentRepo.find.mockResolvedValue([withPlacement('after-payment', 'Settled')]);
            const error = new InsufficientStockError([]);
            reservationService.reserveOrder.mockRejectedValue(error);
            await expect(
                service.handlePaymentStateReached(ctx, order as never),
            ).resolves.toBeUndefined();
            expect(failureService.record).toHaveBeenCalledWith(ctx, 'order-1', error);
        });

        it('rethrows an unexpected error', async () => {
            paymentRepo.find.mockResolvedValue([withPlacement('after-payment', 'Settled')]);
            reservationService.reserveOrder.mockRejectedValue(new Error('db down'));
            await expect(service.handlePaymentStateReached(ctx, order as never)).rejects.toThrow(
                'db down',
            );
        });
    });
});
