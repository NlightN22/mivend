import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInputError } from '@vendure/core';
import type { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationService } from '../../reservation.service';
import {
    ErpExportDataMissingError,
    InsufficientStockError,
    InvalidMultiplicityError,
    OrderNotEligibleError,
} from '../../reservation-errors';
import {
    OrderReservedEvent,
    ReservationConfirmedEvent,
    ReservationReleasedEvent,
} from '../../reservation.events';

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

// mivend#85's ERP-export-readiness gate reads Product.customFields.externalId via raw SQL
// (select/addSelect/from/where/getRawMany) — this mock defaults to resolving every productId to
// its own `ext-<productId>` externalId; tests that need a missing productId override
// getRawMany to omit that row.
function createMockRawQueryBuilder(
    productExternalIds: Record<string, string>,
): ReturnType<typeof vi.fn> {
    return vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getRawMany: vi.fn(async () =>
            Object.entries(productExternalIds).map(([id, externalId]) => ({ id, externalId })),
        ),
    }));
}

describe('ReservationService', () => {
    let reservationRepo: ReturnType<typeof createMockReservationRepo>;
    let orderRepo: ReturnType<typeof createMockOrderRepo>;
    let stockLevelRepo: ReturnType<typeof createMockStockLevelRepo>;
    let connection: {
        getRepository: ReturnType<typeof vi.fn>;
        withTransaction: ReturnType<typeof vi.fn>;
        rawConnection: {
            query: ReturnType<typeof vi.fn>;
            createQueryBuilder: ReturnType<typeof vi.fn>;
        };
    };
    let eventBus: { publish: ReturnType<typeof vi.fn> };
    let warehouseService: { findActiveStockLocationsForBranch: ReturnType<typeof vi.fn> };
    let counterpartyService: { getForCustomer: ReturnType<typeof vi.fn> };
    let service: ReservationService;
    const ctx = { activeUserId: 'user-1' } as unknown as RequestContext;

    const order = {
        id: 'order-1',
        code: 'ORD-1',
        customerId: 'customer-1',
        customFields: { branchId: 'branch-1' },
        lines: [
            {
                id: 'line-1',
                productVariantId: 'variant-1',
                quantity: 2,
                productVariant: { productId: 'product-1', customFields: {} },
            },
            {
                id: 'line-2',
                productVariantId: 'variant-2',
                quantity: 5,
                productVariant: { productId: 'product-2', customFields: {} },
            },
        ],
    };

    beforeEach(() => {
        reservationRepo = createMockReservationRepo();
        orderRepo = createMockOrderRepo(order);
        stockLevelRepo = createMockStockLevelRepo(20);
        eventBus = { publish: vi.fn() };
        warehouseService = {
            findActiveStockLocationsForBranch: vi.fn(async () => [{ id: 'location-1' }]),
        };
        counterpartyService = {
            getForCustomer: vi.fn(async () => ({ erpId: 'counterparty-erp-1' })),
        };
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) => {
                switch (entity?.name) {
                    case 'Order':
                        return orderRepo;
                    case 'StockLevel':
                        return stockLevelRepo;
                    default:
                        return reservationRepo;
                }
            }),
            withTransaction: vi.fn(async (txCtx: unknown, work: (c: unknown) => unknown) =>
                work(txCtx),
            ),
            rawConnection: {
                // setOrderReservationState's self-verifying retry loop reads this back — echo the
                // most recent update() call's target state so it always matches on the first
                // attempt and the test doesn't pay the real setTimeout delay.
                query: vi.fn(async () => {
                    const lastCall = orderRepo.update.mock.calls.at(-1) as
                        | [unknown, { customFields?: { reservationState?: string } }]
                        | undefined;
                    return [{ state: lastCall?.[1]?.customFields?.reservationState }];
                }),
                createQueryBuilder: createMockRawQueryBuilder({
                    'product-1': 'ext-product-1',
                    'product-2': 'ext-product-2',
                }),
            },
        };
        service = new ReservationService(
            connection as unknown as TransactionalConnection,
            eventBus as unknown as EventBus,
            warehouseService as never,
            counterpartyService as never,
        );
    });

    describe('reserveOrder / confirmOrder', () => {
        it('creates one reservation per order line with a shared expiry and publishes ReservationConfirmedEvent + OrderReservedEvent', async () => {
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
                expect.objectContaining({
                    customFields: { branchId: 'branch-1', reservationState: 'RESERVED' },
                }),
            );
            expect(eventBus.publish).toHaveBeenCalledTimes(3);
            expect(eventBus.publish.mock.calls[0][0]).toBeInstanceOf(ReservationConfirmedEvent);
            expect(eventBus.publish.mock.calls[2][0]).toBeInstanceOf(OrderReservedEvent);
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
                expect.objectContaining({
                    customFields: { branchId: 'branch-1', reservationState: 'FAILED' },
                }),
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
                        productVariant: {
                            productId: 'product-1',
                            customFields: { multiplicity: 4 },
                        },
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
                        productVariant: {
                            productId: 'product-1',
                            customFields: { multiplicity: -1 },
                        },
                    },
                ],
            };
            orderRepo.findOne.mockResolvedValue(orderWithBadData);

            await expect(service.confirmOrder(ctx, 'order-1', 3)).resolves.toBeDefined();
        });

        // mivend#85: ReservationService.reserveOrder() gates on the same data
        // erp-integration's order.submitted event needs, so a reservation the outbound event
        // could never report never gets written in the first place (see
        // ErpExportDataMissingError's doc comment).
        it('rejects the whole order when the customer has no Counterparty', async () => {
            counterpartyService.getForCustomer.mockResolvedValue(null);

            const error = await service
                .confirmOrder(ctx, 'order-1', 3)
                .catch((e: unknown) => e as ErpExportDataMissingError);

            expect(error).toBeInstanceOf(ErpExportDataMissingError);
            expect((error as ErpExportDataMissingError).missingCustomerId).toBe(true);
            expect(reservationRepo.save).not.toHaveBeenCalled();
            expect(orderRepo.update).toHaveBeenCalledWith(
                order.id,
                expect.objectContaining({
                    customFields: { branchId: 'branch-1', reservationState: 'FAILED' },
                }),
            );
        });

        it('rejects the whole order when the order has no customer at all', async () => {
            orderRepo.findOne.mockResolvedValue({ ...order, customerId: null });

            const error = await service
                .confirmOrder(ctx, 'order-1', 3)
                .catch((e: unknown) => e as ErpExportDataMissingError);

            expect(error).toBeInstanceOf(ErpExportDataMissingError);
            expect((error as ErpExportDataMissingError).missingCustomerId).toBe(true);
            expect(counterpartyService.getForCustomer).not.toHaveBeenCalled();
        });

        it('rejects every line as missing warehouseId when the branch has no active StockLocation', async () => {
            warehouseService.findActiveStockLocationsForBranch.mockResolvedValue([]);

            const error = await service
                .confirmOrder(ctx, 'order-1', 3)
                .catch((e: unknown) => e as ErpExportDataMissingError);

            expect(error).toBeInstanceOf(ErpExportDataMissingError);
            expect((error as ErpExportDataMissingError).lines).toEqual([
                { orderLineId: 'line-1', productVariantId: 'variant-1', missing: ['warehouseId'] },
                { orderLineId: 'line-2', productVariantId: 'variant-2', missing: ['warehouseId'] },
            ]);
        });

        it('rejects only the line whose product has no ERP externalId', async () => {
            connection.rawConnection.createQueryBuilder = createMockRawQueryBuilder({
                'product-1': 'ext-product-1',
                // product-2 deliberately omitted — not yet ERP-synced.
            });

            const error = await service
                .confirmOrder(ctx, 'order-1', 3)
                .catch((e: unknown) => e as ErpExportDataMissingError);

            expect(error).toBeInstanceOf(ErpExportDataMissingError);
            expect((error as ErpExportDataMissingError).lines).toEqual([
                { orderLineId: 'line-2', productVariantId: 'variant-2', missing: ['productId'] },
            ]);
        });

        it('picks the candidate StockLocation with the most available stock per line', async () => {
            warehouseService.findActiveStockLocationsForBranch.mockResolvedValue([
                { id: 'location-a' },
                { id: 'location-b' },
            ]);
            const availableByLocation: Record<string, number> = {
                'location-a': 3,
                'location-b': 10,
            };
            stockLevelRepo.createQueryBuilder = vi.fn(() => {
                const builder = {
                    __locationId: '',
                    setLock: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    andWhere: vi.fn(function (
                        this: typeof builder,
                        _clause: string,
                        params: { stockLocationId: string },
                    ) {
                        this.__locationId = params.stockLocationId;
                        return this;
                    }),
                    getOne: vi.fn(async function (this: typeof builder) {
                        return {
                            stockOnHand: availableByLocation[this.__locationId] ?? 0,
                            stockAllocated: 0,
                        };
                    }),
                };
                return builder;
            });

            await service.confirmOrder(ctx, 'order-1', 3);

            expect(reservationRepo.save).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        orderLineId: 'line-1',
                        stockLocationId: 'location-b',
                    }),
                ]),
            );
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
