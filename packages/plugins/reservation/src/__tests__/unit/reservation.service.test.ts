import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInputError } from '@vendure/core';
import type { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';
import type { DataSource } from 'typeorm';

import { ReservationService } from '../../reservation.service';
import type { ReservationExtensionLimitService } from '../../reservation-extension-limit.service';

const mockAdministratorService = {} as unknown as AdministratorService;
const mockExtensionLimitService = {} as unknown as ReservationExtensionLimitService;

function createMockReservationRepo(): {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
} {
    return {
        count: vi.fn(async () => 0),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
        update: vi.fn(async () => ({ affected: 1 })),
        find: vi.fn(async () => [] as unknown[]),
    };
}

function createMockOrderRepo(order: unknown): { findOne: ReturnType<typeof vi.fn> } {
    return { findOne: vi.fn(async () => order) };
}

describe('ReservationService', () => {
    let reservationRepo: ReturnType<typeof createMockReservationRepo>;
    let orderRepo: ReturnType<typeof createMockOrderRepo>;
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let service: ReservationService;
    const ctx = {} as unknown as RequestContext;

    const order = {
        id: 'order-1',
        lines: [
            { id: 'line-1', productVariantId: 'variant-1', quantity: 2 },
            { id: 'line-2', productVariantId: 'variant-2', quantity: 5 },
        ],
    };

    beforeEach(() => {
        reservationRepo = createMockReservationRepo();
        orderRepo = createMockOrderRepo(order);
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) =>
                entity?.name === 'Order' ? orderRepo : reservationRepo,
            ),
        };
        service = new ReservationService(
            connection as unknown as TransactionalConnection,
            {} as unknown as DataSource,
            mockAdministratorService,
            mockExtensionLimitService,
        );
    });

    describe('confirmOrder', () => {
        it('creates one reservation per order line with a shared expiry', async () => {
            await service.confirmOrder(ctx, 'order-1', 3);

            expect(reservationRepo.save).toHaveBeenCalledWith([
                expect.objectContaining({
                    orderLineId: 'line-1',
                    productVariantId: 'variant-1',
                    quantity: 2,
                    status: 'active',
                }),
                expect.objectContaining({
                    orderLineId: 'line-2',
                    productVariantId: 'variant-2',
                    quantity: 5,
                    status: 'active',
                }),
            ]);
        });

        it('rejects a second confirm while an active reservation already exists', async () => {
            reservationRepo.count.mockResolvedValue(1);
            await expect(service.confirmOrder(ctx, 'order-1', 3)).rejects.toThrow(UserInputError);
            expect(reservationRepo.save).not.toHaveBeenCalled();
        });

        it('rejects a non-positive reservationDays', async () => {
            await expect(service.confirmOrder(ctx, 'order-1', 0)).rejects.toThrow(UserInputError);
            await expect(service.confirmOrder(ctx, 'order-1', -1)).rejects.toThrow(UserInputError);
        });

        it('rejects when the order does not exist', async () => {
            orderRepo.findOne.mockResolvedValue(null);
            await expect(service.confirmOrder(ctx, 'missing', 3)).rejects.toThrow(UserInputError);
        });
    });

    describe('releaseReservations', () => {
        it('marks active reservations for the order as released', async () => {
            await service.releaseReservations(ctx, 'order-1');
            expect(reservationRepo.update).toHaveBeenCalledWith(
                { orderId: 'order-1', status: 'active' },
                expect.objectContaining({ status: 'released' }),
            );
        });
    });

    describe('getReservedQuantity', () => {
        it('sums quantity across active reservations for a variant', async () => {
            reservationRepo.find.mockResolvedValue([{ quantity: 2 }, { quantity: 5 }]);
            const total = await service.getReservedQuantity(ctx, 'variant-1');
            expect(total).toBe(7);
        });
    });

    describe('getAvailableQuantity', () => {
        it('subtracts active reservations from summed stockOnHand across stock levels', async () => {
            const stockLevelRepo = {
                find: vi.fn(async () => [{ stockOnHand: 10 }, { stockOnHand: 5 }]),
            };
            connection.getRepository.mockImplementation(
                (_ctx: unknown, entity: { name?: string }) =>
                    entity?.name === 'StockLevel' ? stockLevelRepo : reservationRepo,
            );
            reservationRepo.find.mockResolvedValue([{ quantity: 4 }]);

            const available = await service.getAvailableQuantity(ctx, 'variant-1');
            expect(available).toBe(11);
        });
    });

    describe('extendReservation', () => {
        let extensionLimitService: { getLimit: ReturnType<typeof vi.fn> };
        let administratorService: { findOneByUserId: ReturnType<typeof vi.fn> };
        let ctxWithUser: RequestContext;

        beforeEach(() => {
            extensionLimitService = {
                getLimit: vi.fn(async () => ({ roleCode: 'manager', maxExtraDays: 3 })),
            };
            administratorService = {
                findOneByUserId: vi.fn(async () => ({ user: { roles: [{ code: 'manager' }] } })),
            };
            ctxWithUser = { activeUserId: 'user-1' } as unknown as RequestContext;
            service = new ReservationService(
                connection as unknown as TransactionalConnection,
                {} as unknown as DataSource,
                administratorService as unknown as AdministratorService,
                extensionLimitService as unknown as ReservationExtensionLimitService,
            );
        });

        it('extends expiry on active reservations within the role limit', async () => {
            const activeRow = { expiresAt: new Date('2026-01-01T00:00:00.000Z') };
            reservationRepo.find.mockResolvedValue([activeRow]);

            await service.extendReservation(ctxWithUser, 'order-1', 2);

            expect(activeRow.expiresAt).toEqual(new Date('2026-01-03T00:00:00.000Z'));
            expect(reservationRepo.save).toHaveBeenCalledWith([activeRow]);
        });

        it('rejects an extension beyond the role limit', async () => {
            reservationRepo.find.mockResolvedValue([{ expiresAt: new Date() }]);
            await expect(service.extendReservation(ctxWithUser, 'order-1', 10)).rejects.toThrow();
        });

        it('rejects when the role has no configured limit', async () => {
            extensionLimitService.getLimit.mockResolvedValue(null);
            await expect(service.extendReservation(ctxWithUser, 'order-1', 1)).rejects.toThrow();
        });
    });

    describe('expireDueReservations', () => {
        it('bulk-updates active, past-due reservations to expired', async () => {
            const execute = vi.fn(async () => ({ affected: 3 }));
            const qb = {
                update: vi.fn().mockReturnThis(),
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                andWhere: vi.fn().mockReturnThis(),
                execute,
            };
            const dataSource = {
                getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb) })),
            } as unknown as DataSource;
            const svc = new ReservationService(
                connection as unknown as TransactionalConnection,
                dataSource,
                mockAdministratorService,
                mockExtensionLimitService,
            );

            const count = await svc.expireDueReservations();

            expect(qb.set).toHaveBeenCalledWith({ status: 'expired' });
            expect(execute).toHaveBeenCalled();
            expect(count).toBe(3);
        });
    });
});
