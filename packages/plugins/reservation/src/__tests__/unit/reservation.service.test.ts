import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInputError } from '@vendure/core';
import type { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationService } from '../../reservation.service';
import {
    InsufficientStockError,
    InvalidMultiplicityError,
    OrderNotEligibleError,
} from '../../reservation-errors';
import { ReservationConfirmedEvent, ReservationReleasedEvent } from '../../reservation.events';

function createMockReservationRepo(): {
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
} {
    return {
        find: vi.fn(async () => [] as unknown[]),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
        createQueryBuilder: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            getRawOne: vi.fn(async () => ({ max: null })),
        })),
    };
}

function createMockOrderRepo(order: unknown): {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
} {
    return {
        findOne: vi.fn(async () => order),
        save: vi.fn(async (x: unknown) => x),
        update: vi.fn(async () => undefined),
    };
}

function createMockStockLevelRepo(
    stockOnHand: number,
    stockAllocated = 0,
): {
    createQueryBuilder: ReturnType<typeof vi.fn>;
} {
    return {
        createQueryBuilder: vi.fn(() => ({
            setLock: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            getOne: vi.fn(async () => ({ stockOnHand, stockAllocated })),
        })),
    };
}

function createMockStockLocationRepo(): { createQueryBuilder: ReturnType<typeof vi.fn> } {
    return {
        createQueryBuilder: vi.fn(() => ({
            getOne: vi.fn(async () => ({ id: 'location-1' })),
        })),
    };
}

describe('ReservationService', () => {
    let reservationRepo: ReturnType<typeof createMockReservationRepo>;
    let orderRepo: ReturnType<typeof createMockOrderRepo>;
    let stockLevelRepo: ReturnType<typeof createMockStockLevelRepo>;
    let stockLocationRepo: ReturnType<typeof createMockStockLocationRepo>;
    let connection: {
        getRepository: ReturnType<typeof vi.fn>;
        withTransaction: ReturnType<typeof vi.fn>;
        rawConnection: { query: ReturnType<typeof vi.fn> };
    };
    let eventBus: { publish: ReturnType<typeof vi.fn> };
    let service: ReservationService;
    const ctx = { activeUserId: 'user-1' } as unknown as RequestContext;

    const order = {
        id: 'order-1',
        code: 'ORD-1',
        customFields: {},
        lines: [
            {
                id: 'line-1',
                productVariantId: 'variant-1',
                quantity: 2,
                productVariant: { customFields: {} },
            },
            {
                id: 'line-2',
                productVariantId: 'variant-2',
                quantity: 5,
                productVariant: { customFields: {} },
            },
        ],
    };

    beforeEach(() => {
        reservationRepo = createMockReservationRepo();
        orderRepo = createMockOrderRepo(order);
        stockLevelRepo = createMockStockLevelRepo(20);
        stockLocationRepo = createMockStockLocationRepo();
        eventBus = { publish: vi.fn() };
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) => {
                switch (entity?.name) {
                    case 'Order':
                        return orderRepo;
                    case 'StockLevel':
                        return stockLevelRepo;
                    case 'StockLocation':
                        return stockLocationRepo;
                    default:
                        return reservationRepo;
                }
            }),
            withTransaction: vi.fn(async (txCtx: unknown, work: (c: unknown) => unknown) =>
                work(txCtx),
            ),
            // setOrderReservationState's self-verifying retry loop reads this back — echo the
            // most recent update() call's target state so it always matches on the first
            // attempt and the test doesn't pay the real setTimeout delay.
            rawConnection: {
                query: vi.fn(async () => {
                    const lastCall = orderRepo.update.mock.calls.at(-1) as
                        | [unknown, { customFields?: { reservationState?: string } }]
                        | undefined;
                    return [{ state: lastCall?.[1]?.customFields?.reservationState }];
                }),
            },
        };
        service = new ReservationService(
            connection as unknown as TransactionalConnection,
            eventBus as unknown as EventBus,
        );
    });

    describe('reserveOrder / confirmOrder', () => {
        it('creates one reservation per order line with a shared expiry and publishes ReservationConfirmedEvent', async () => {
            await service.confirmOrder(ctx, 'order-1', 3);

            expect(reservationRepo.save).toHaveBeenCalledWith([
                expect.objectContaining({
                    orderLineId: 'line-1',
                    productVariantId: 'variant-1',
                    quantity: 2,
                    status: 'active',
                    stockLocationId: 'location-1',
                    creationMethod: 'manual',
                    confirmedByAdministratorId: 'user-1',
                    erpOperationId: expect.any(String),
                }),
                expect.objectContaining({
                    orderLineId: 'line-2',
                    productVariantId: 'variant-2',
                    quantity: 5,
                    status: 'active',
                }),
            ]);
            expect(orderRepo.update).toHaveBeenCalledWith(
                order.id,
                expect.objectContaining({ customFields: { reservationState: 'RESERVED' } }),
            );
            expect(eventBus.publish).toHaveBeenCalledTimes(2);
            expect(eventBus.publish.mock.calls[0][0]).toBeInstanceOf(ReservationConfirmedEvent);
        });

        it('is idempotent — a second call while an active reservation already exists is a no-op', async () => {
            const existing = [{ id: 'res-1', status: 'active' }];
            reservationRepo.find.mockResolvedValue(existing);

            const result = await service.confirmOrder(ctx, 'order-1', 3);

            expect(result).toBe(existing);
            expect(reservationRepo.save).not.toHaveBeenCalled();
            expect(eventBus.publish).not.toHaveBeenCalled();
        });

        it('rejects a non-positive reservationDays', async () => {
            await expect(service.confirmOrder(ctx, 'order-1', 0)).rejects.toThrow(UserInputError);
            await expect(service.confirmOrder(ctx, 'order-1', -1)).rejects.toThrow(UserInputError);
        });

        it('rejects when the order does not exist', async () => {
            orderRepo.findOne.mockResolvedValue(null);
            await expect(service.confirmOrder(ctx, 'missing', 3)).rejects.toThrow(
                OrderNotEligibleError,
            );
        });

        it('is full-order-only: rolls back and marks the order FAILED when any line is short', async () => {
            stockLevelRepo.createQueryBuilder = vi.fn(() => ({
                setLock: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                andWhere: vi.fn().mockReturnThis(),
                getOne: vi.fn(async () => ({ stockOnHand: 1, stockAllocated: 0 })),
            }));

            const error = await service
                .confirmOrder(ctx, 'order-1', 3)
                .catch((e: unknown) => e as InsufficientStockError);

            expect(error).toBeInstanceOf(InsufficientStockError);
            expect((error as InsufficientStockError).lines).toHaveLength(2);
            expect(reservationRepo.save).not.toHaveBeenCalled();
            expect(orderRepo.update).toHaveBeenCalledWith(
                order.id,
                expect.objectContaining({ customFields: { reservationState: 'FAILED' } }),
            );
        });

        it('rejects a quantity that is not a multiple of the variant multiplicity, before checking stock', async () => {
            const orderWithMultiplicity = {
                ...order,
                lines: [
                    {
                        id: 'line-1',
                        productVariantId: 'variant-1',
                        quantity: 5,
                        productVariant: { customFields: { multiplicity: 4 } },
                    },
                ],
            };
            orderRepo.findOne.mockResolvedValue(orderWithMultiplicity);

            const error = await service
                .confirmOrder(ctx, 'order-1', 3)
                .catch((e: unknown) => e as InvalidMultiplicityError);

            expect(error).toBeInstanceOf(InvalidMultiplicityError);
            expect((error as InvalidMultiplicityError).lines).toEqual([
                {
                    orderLineId: 'line-1',
                    productVariantId: 'variant-1',
                    quantity: 5,
                    multiplicity: 4,
                },
            ]);
            expect(stockLevelRepo.createQueryBuilder).not.toHaveBeenCalled();
        });

        it('treats null/0/negative multiplicity as no constraint', async () => {
            const orderWithBadData = {
                ...order,
                lines: [
                    {
                        id: 'line-1',
                        productVariantId: 'variant-1',
                        quantity: 3,
                        productVariant: { customFields: { multiplicity: -1 } },
                    },
                ],
            };
            orderRepo.findOne.mockResolvedValue(orderWithBadData);

            await expect(service.confirmOrder(ctx, 'order-1', 3)).resolves.toBeDefined();
        });
    });

    describe('releaseReservations', () => {
        it('releases active reservations, assigns a release operation id, and publishes ReservationReleasedEvent', async () => {
            const activeRow = { id: 'res-1', status: 'active', expiresAt: new Date() };
            reservationRepo.find.mockResolvedValue([activeRow]);

            const count = await service.releaseReservations(ctx, 'order-1');

            expect(count).toBe(1);
            expect(reservationRepo.save).toHaveBeenCalledWith([
                expect.objectContaining({
                    status: 'released',
                    erpReleaseOperationId: expect.any(String),
                }),
            ]);
            expect(eventBus.publish).toHaveBeenCalledTimes(1);
            expect(eventBus.publish.mock.calls[0][0]).toBeInstanceOf(ReservationReleasedEvent);
        });

        it('is a no-op when there is nothing active to release', async () => {
            reservationRepo.find.mockResolvedValue([]);
            const count = await service.releaseReservations(ctx, 'order-1');
            expect(count).toBe(0);
            expect(eventBus.publish).not.toHaveBeenCalled();
        });
    });

    describe('findForOrder', () => {
        it('delegates to the repository ordered by reservedAt desc', async () => {
            await service.findForOrder(ctx, 'order-1');
            expect(reservationRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({ where: { orderId: 'order-1' } }),
            );
        });
    });
});
