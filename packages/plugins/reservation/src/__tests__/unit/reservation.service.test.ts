import { PackagingPolicyService } from '@mivend/plugin-moq';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInputError } from '@vendure/core';
import type { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationService } from '../../reservation.service';
import { lockStockLevelsInOrder } from '../../reservation-location-picker';
import {
    ErpExportDataMissingError,
    InsufficientStockError,
    InvalidMultiplicityError,
    OrderNotEligibleError,
} from '../../reservation-errors';
import {
    OrderReservedEvent,
    OrderStaffConfirmedEvent,
    ReservationConfirmedEvent,
    ReservationReleasedEvent,
} from '../../reservation.events';

// The ordered pre-lock is a query-shape concern, covered against real Postgres in reserve-order.concurrency.test.ts.
vi.mock('../../reservation-location-picker', async importOriginal => ({
    ...(await importOriginal<typeof import('../../reservation-location-picker')>()),
    lockStockLevelsInOrder: vi.fn(async () => undefined),
}));

function createMockReservationRepo(): {
    find: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
} {
    return {
        find: vi.fn(async () => [] as unknown[]),
        count: vi.fn(async () => 0),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
        createQueryBuilder: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            getRawOne: vi.fn(async () => ({ max: null })),
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            execute: vi.fn(async () => ({ affected: 0 })),
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

// Stands in for the raw-SQL Product.customFields.externalId lookup the ERP export gate runs;
// tests needing a missing externalId must override getRawMany to omit that row.
function productRows(productExternalIds: Record<string, string>): unknown[] {
    return Object.entries(productExternalIds).map(([id, externalId]) => ({ id, externalId }));
}

describe('ReservationService', () => {
    let reservationRepo: ReturnType<typeof createMockReservationRepo>;
    let orderRepo: ReturnType<typeof createMockOrderRepo>;
    let stockLevelRepo: ReturnType<typeof createMockStockLevelRepo>;
    let connection: {
        getRepository: ReturnType<typeof vi.fn>;
        withTransaction: ReturnType<typeof vi.fn>;
    };
    let eventBus: { publish: ReturnType<typeof vi.fn> };
    let warehouseService: { findBranchStockLocationIds: ReturnType<typeof vi.fn> };
    let counterpartyService: { getForCustomer: ReturnType<typeof vi.fn> };
    let contractService: { resolveOrderContract: ReturnType<typeof vi.fn> };
    let orderChecks: { isHeld: ReturnType<typeof vi.fn> };
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
                customFields: { organizationId: 1 },
                productVariant: { productId: 'product-1' },
            },
            {
                id: 'line-2',
                productVariantId: 'variant-2',
                quantity: 5,
                customFields: { organizationId: 1 },
                productVariant: { productId: 'product-2' },
            },
        ],
    };

    let branchSettings: { packagesOnly: boolean; enforceMultiplicity: boolean } | null;

    let productExternalIds: Record<string, string>;

    beforeEach(() => {
        branchSettings = { packagesOnly: false, enforceMultiplicity: true };
        reservationRepo = createMockReservationRepo();
        orderRepo = createMockOrderRepo(order);
        stockLevelRepo = createMockStockLevelRepo(20);
        eventBus = { publish: vi.fn() };
        warehouseService = {
            findBranchStockLocationIds: vi.fn(async () => ['location-1']),
        };
        counterpartyService = {
            getForCustomer: vi.fn(async () => ({ erpId: 'counterparty-erp-1' })),
        };
        contractService = {
            resolveOrderContract: vi.fn(async () => ({ erpId: 'contract-erp-1' })),
        };
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string } | string) => {
                if (typeof entity === 'string') {
                    return {
                        query: vi.fn(async (sql: string) =>
                            sql.includes('FROM product p') ? productRows(productExternalIds) : [],
                        ),
                    };
                }
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
        };
        productExternalIds = { 'product-1': 'ext-product-1', 'product-2': 'ext-product-2' };
        orderChecks = { isHeld: vi.fn(async () => false) };
        service = new ReservationService(
            connection as unknown as TransactionalConnection,
            eventBus as unknown as EventBus,
            warehouseService as never,
            counterpartyService as never,
            contractService as never,
            new PackagingPolicyService(
                { resolveEffective: async () => branchSettings } as never,
                { getPreferredForCustomer: async () => null } as never,
                {
                    resolve: async () => ({
                        enabled: branchSettings?.enforceMultiplicity === true,
                        consequence: 'block',
                    }),
                } as never,
            ),
            orderChecks as never,
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
                    customFields: {
                        reservationState: 'RESERVED',
                        reservationFailureReason: null,
                        reservationFailureDetail: null,
                        reservationFailedAt: null,
                    },
                }),
            );
            expect(eventBus.publish).toHaveBeenCalledTimes(3);
            expect(eventBus.publish.mock.calls[0][0]).toBeInstanceOf(ReservationConfirmedEvent);
            expect(eventBus.publish.mock.calls[2][0]).toBeInstanceOf(OrderReservedEvent);
        });

        it('locks the stock levels of all lines in one ordered statement before picking locations', async () => {
            vi.mocked(lockStockLevelsInOrder).mockClear();
            await service.confirmOrder(ctx, 'order-1', 3);

            expect(lockStockLevelsInOrder).toHaveBeenCalledTimes(1);
            expect(vi.mocked(lockStockLevelsInOrder).mock.calls[0][2]).toEqual([
                'variant-1',
                'variant-2',
            ]);
        });

        it('clears a failure left by an earlier failed automatic reserve when the reserve succeeds', async () => {
            orderRepo.findOne.mockResolvedValue({
                ...order,
                customFields: {
                    ...order.customFields,
                    reservationFailureReason: 'INSUFFICIENT_STOCK',
                    reservationFailureDetail: 'SKU 1: need 1, available 0',
                    reservationFailedAt: new Date(),
                },
            });

            await service.confirmOrder(ctx, 'order-1', 3);

            const [, { customFields }] = orderRepo.update.mock.calls.at(-1) as [
                unknown,
                { customFields: Record<string, unknown> },
            ];
            expect(customFields.reservationState).toBe('RESERVED');
            expect(customFields.reservationFailureReason).toBeNull();
            expect(customFields.reservationFailureDetail).toBeNull();
            expect(customFields.reservationFailedAt).toBeNull();
        });

        it('leaves the order in the confirmation queue without reserving when an order check holds it (#237)', async () => {
            orderChecks.isHeld.mockResolvedValue(true);

            const result = await service.reserveOrder(ctx, 'order-1', 3, 'auto-trust-rule');

            expect(result).toEqual([]);
            expect(orderChecks.isHeld).toHaveBeenCalledWith(
                expect.anything(),
                'order-1',
                'auto-trust-rule',
            );
            expect(reservationRepo.save).not.toHaveBeenCalled();
            expect(eventBus.publish).not.toHaveBeenCalled();
            const [, { customFields }] = orderRepo.update.mock.calls.at(-1) as [
                unknown,
                { customFields: Record<string, unknown> },
            ];
            expect(customFields.reservationState).toBe('AWAITING_CONFIRMATION');
        });

        it('holds an automatic reserve of an order with an ERP data gap in the queue instead of failing it, and staff confirmation meets the gate (#241)', async () => {
            counterpartyService.getForCustomer.mockResolvedValue(null);
            orderChecks.isHeld.mockResolvedValue(true);

            const held = await service.reserveOrder(ctx, 'order-1', 3, 'auto-trust-rule');

            expect(held).toEqual([]);
            const [, { customFields }] = orderRepo.update.mock.calls.at(-1) as [
                unknown,
                { customFields: Record<string, unknown> },
            ];
            expect(customFields.reservationState).toBe('AWAITING_CONFIRMATION');

            orderChecks.isHeld.mockResolvedValue(false);
            await expect(service.confirmOrder(ctx, 'order-1', 3)).rejects.toBeInstanceOf(
                ErpExportDataMissingError,
            );
            expect(reservationRepo.save).not.toHaveBeenCalled();
        });

        it('asks the order checks with the manual trigger so staff confirmation is the release', async () => {
            await service.confirmOrder(ctx, 'order-1', 3);

            expect(orderChecks.isHeld).toHaveBeenCalledWith(expect.anything(), 'order-1', 'manual');
            expect(reservationRepo.save).toHaveBeenCalled();
        });

        it('is idempotent — a second call while an active reservation already exists is a no-op', async () => {
            const existing = [{ id: 'res-1', status: 'active' }];
            reservationRepo.find.mockResolvedValue(existing);

            const result = await service.confirmOrder(ctx, 'order-1', 3);

            expect(result).toBe(existing);
            expect(reservationRepo.save).not.toHaveBeenCalled();
            expect(eventBus.publish).not.toHaveBeenCalled();
        });

        it('a staff confirmation of an already reserved order stamps it and announces the release once', async () => {
            reservationRepo.find.mockResolvedValue([{ id: 'res-1', status: 'active' }]);
            const execute = vi
                .fn()
                .mockResolvedValueOnce({ affected: 1 })
                .mockResolvedValue({ affected: 0 });
            reservationRepo.createQueryBuilder.mockReturnValue({
                update: vi.fn().mockReturnThis(),
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute,
            });

            await service.confirmOrder(ctx, 'order-1', 3);
            await service.confirmOrder(ctx, 'order-1', 3);

            const events = eventBus.publish.mock.calls.map(([event]) => event);
            expect(events).toHaveLength(1);
            expect(events[0]).toBeInstanceOf(OrderStaffConfirmedEvent);
            expect(reservationRepo.save).not.toHaveBeenCalled();
        });

        it('an automatic re-trigger over an existing reservation never counts as a staff release', async () => {
            reservationRepo.find.mockResolvedValue([{ id: 'res-1', status: 'active' }]);

            await service.reserveOrder(ctx, 'order-1', 3, 'auto-trust-rule');

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
                    customFields: { reservationState: 'FAILED' },
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

        it('does not enforce multiplicity when the branch has not enabled it (#219)', async () => {
            branchSettings = { packagesOnly: false, enforceMultiplicity: false };
            orderRepo.findOne.mockResolvedValue({
                ...order,
                lines: [
                    {
                        id: 'line-1',
                        productVariantId: 'variant-1',
                        quantity: 5,
                        customFields: { organizationId: 1 },
                        productVariant: {
                            productId: 'product-1',
                            customFields: { multiplicity: 4 },
                        },
                    },
                ],
            });

            await expect(service.confirmOrder(ctx, 'order-1', 3)).resolves.toBeDefined();
        });

        it('lets the pack rule replace multiplicity, agreeing with the order interceptor (#219)', async () => {
            branchSettings = { packagesOnly: true, enforceMultiplicity: true };
            orderRepo.findOne.mockResolvedValue({
                ...order,
                lines: [
                    {
                        id: 'line-1',
                        productVariantId: 'variant-1',
                        quantity: 6,
                        customFields: { organizationId: 1 },
                        productVariant: {
                            productId: 'product-1',
                            customFields: { multiplicity: 10, unitRatioToBase: 6 },
                        },
                    },
                ],
            });

            await expect(service.confirmOrder(ctx, 'order-1', 3)).resolves.toBeDefined();
        });

        it('treats null/0/negative multiplicity as no constraint', async () => {
            const orderWithBadData = {
                ...order,
                lines: [
                    {
                        id: 'line-1',
                        productVariantId: 'variant-1',
                        quantity: 3,
                        customFields: { organizationId: 1 },
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

        // reserveOrder() checks the same data the order.confirmed event needs; a reservation
        // that event could never report is never written (see ErpExportDataMissingError).
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
                    customFields: { reservationState: 'FAILED' },
                }),
            );
        });

        it('refuses an order with no lines and writes nothing', async () => {
            orderRepo.findOne.mockResolvedValue({ ...order, lines: [] });

            await expect(service.confirmOrder(ctx, 'order-1', 3)).rejects.toThrow(
                'Order has no lines',
            );
            expect(reservationRepo.save).not.toHaveBeenCalled();
        });

        it('refuses an order that came from the ERP and writes nothing', async () => {
            orderRepo.findOne.mockResolvedValue({
                ...order,
                customFields: { ...order.customFields, isExternal: true },
            });

            await expect(service.confirmOrder(ctx, 'order-1', 3)).rejects.toThrow(
                OrderNotEligibleError,
            );
            expect(reservationRepo.save).not.toHaveBeenCalled();
            expect(eventBus.publish).not.toHaveBeenCalled();
        });

        it('rejects the whole order when no active contract can register it', async () => {
            contractService.resolveOrderContract.mockResolvedValue(null);

            const error = await service
                .confirmOrder(ctx, 'order-1', 3)
                .catch((e: unknown) => e as ErpExportDataMissingError);

            expect(error).toBeInstanceOf(ErpExportDataMissingError);
            expect((error as ErpExportDataMissingError).missingContract).toBe(true);
            expect(reservationRepo.save).not.toHaveBeenCalled();
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
            warehouseService.findBranchStockLocationIds.mockResolvedValue([]);

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
            productExternalIds = {
                'product-1': 'ext-product-1',
                // product-2 deliberately omitted — not yet ERP-synced.
            };

            const error = await service
                .confirmOrder(ctx, 'order-1', 3)
                .catch((e: unknown) => e as ErpExportDataMissingError);

            expect(error).toBeInstanceOf(ErpExportDataMissingError);
            expect((error as ErpExportDataMissingError).lines).toEqual([
                { orderLineId: 'line-2', productVariantId: 'variant-2', missing: ['productId'] },
            ]);
        });

        it('rejects only the line whose variant has no organization', async () => {
            orderRepo.findOne.mockResolvedValue({
                ...order,
                lines: [
                    order.lines[0],
                    {
                        ...order.lines[1],
                        customFields: {},
                        productVariant: { productId: 'product-2' },
                    },
                ],
            });

            const error = await service
                .confirmOrder(ctx, 'order-1', 3)
                .catch((e: unknown) => e as ErpExportDataMissingError);

            expect(error).toBeInstanceOf(ErpExportDataMissingError);
            expect((error as ErpExportDataMissingError).lines).toEqual([
                {
                    orderLineId: 'line-2',
                    productVariantId: 'variant-2',
                    missing: ['organizationId'],
                },
            ]);
            expect(reservationRepo.save).not.toHaveBeenCalled();
        });

        it('picks the candidate StockLocation with the most available stock per line', async () => {
            warehouseService.findBranchStockLocationIds.mockResolvedValue([
                'location-a',
                'location-b',
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
        function mockReleasedRows(rows: unknown[]): { set: ReturnType<typeof vi.fn> } {
            const builder = {
                update: vi.fn().mockReturnThis(),
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                returning: vi.fn().mockReturnThis(),
                execute: vi.fn(async () => ({ raw: rows })),
            };
            reservationRepo.createQueryBuilder.mockReturnValue(builder);
            return builder;
        }

        it('releases only rows still active, assigns a release operation id, and publishes ReservationReleasedEvent', async () => {
            const builder = mockReleasedRows([{ id: 'res-1', status: 'released' }]);

            const count = await service.releaseReservations(ctx, 'order-1');

            expect(count).toBe(1);
            expect(builder.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'released',
                    erpReleaseOperationId: expect.any(Function),
                }),
            );
            expect(eventBus.publish).toHaveBeenCalledTimes(1);
            expect(eventBus.publish.mock.calls[0][0]).toBeInstanceOf(ReservationReleasedEvent);
        });

        it('is a no-op when there is nothing active to release', async () => {
            mockReleasedRows([]);
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
