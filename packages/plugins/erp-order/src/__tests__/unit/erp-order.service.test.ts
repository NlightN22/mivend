import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext } from '@vendure/core';
import { ErpOrderService } from '../../erp-order.service';

const mockOrderRepo = {
    save: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
};

const mockFulfillmentQb = {
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    getMany: vi.fn(),
};
mockFulfillmentQb.innerJoin.mockReturnValue(mockFulfillmentQb);
mockFulfillmentQb.where.mockReturnValue(mockFulfillmentQb);
mockFulfillmentQb.orderBy.mockReturnValue(mockFulfillmentQb);

const mockFulfillmentRepo = {
    findOne: vi.fn(),
    createQueryBuilder: vi.fn(() => mockFulfillmentQb),
};

const mockConnection = {
    getRepository: vi.fn((_ctx: unknown, entity: { name: string }) =>
        entity.name === 'Fulfillment' ? mockFulfillmentRepo : mockOrderRepo,
    ),
};

const mockEventBus = { publish: vi.fn() };
const mockTradingPointService = {
    getPreferredForCustomer: vi.fn(),
    resolveServicingBranchId: vi.fn(),
};
const mockAdministratorService = { findOneByUserId: vi.fn() };

const mockCtx = { activeUserId: 'user-1' } as unknown as RequestContext;

describe('ErpOrderService', () => {
    let service: ErpOrderService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockFulfillmentQb.innerJoin.mockReturnValue(mockFulfillmentQb);
        mockFulfillmentQb.where.mockReturnValue(mockFulfillmentQb);
        mockFulfillmentQb.orderBy.mockReturnValue(mockFulfillmentQb);
        service = new ErpOrderService(
            mockConnection as never,
            mockEventBus as never,
            mockTradingPointService as never,
            mockAdministratorService as never,
        );
    });

    describe('onOrderPlaced', () => {
        it('denormalizes placedByAdministratorId when the actor resolves to a real Administrator', async () => {
            mockAdministratorService.findOneByUserId.mockResolvedValue({ id: 'admin-1' });
            const order = { customFields: {}, customerId: null } as never;

            await service.onOrderPlaced(mockCtx, order);

            expect(mockAdministratorService.findOneByUserId).toHaveBeenCalledWith(
                mockCtx,
                'user-1',
            );
            expect(
                (order as { customFields: { placedByAdministratorId?: string } }).customFields
                    .placedByAdministratorId,
            ).toBe('admin-1');
            expect(mockOrderRepo.save).toHaveBeenCalledWith(order);
        });

        it("leaves placedByAdministratorId unset for a storefront customer's own checkout (no matching Administrator)", async () => {
            mockAdministratorService.findOneByUserId.mockResolvedValue(null);
            const order = { customFields: {}, customerId: null } as never;

            await service.onOrderPlaced(mockCtx, order);

            expect(
                (order as { customFields: { placedByAdministratorId?: string } }).customFields
                    .placedByAdministratorId,
            ).toBeUndefined();
        });
    });

    describe('onOrderPlaced branch resolution', () => {
        it('denormalizes the resolved branch (point -> counterparty -> default) onto the order', async () => {
            mockAdministratorService.findOneByUserId.mockResolvedValue(null);
            const point = { id: 7, servicingBranchId: null, counterpartyId: '5' };
            mockTradingPointService.getPreferredForCustomer.mockResolvedValue(point);
            mockTradingPointService.resolveServicingBranchId.mockResolvedValue('branch-b');
            const order = { customFields: {}, customerId: 'cust-1' } as never;

            await service.onOrderPlaced(mockCtx, order);

            expect(mockTradingPointService.resolveServicingBranchId).toHaveBeenCalledWith(
                mockCtx,
                point,
            );
            expect((order as { customFields: { branchId?: string } }).customFields.branchId).toBe(
                'branch-b',
            );
        });
    });

    describe('onFulfillmentStateChanged', () => {
        it("sets latestFulfillmentState to the most-recently-created fulfillment's state, not just any one", async () => {
            mockFulfillmentRepo.findOne.mockResolvedValue({
                id: 'f-2',
                orders: [{ id: 'order-1' }],
            });
            // orderBy('createdAt', 'ASC') — the query itself returns them oldest-first; the
            // service takes the *last* array element as "most recent".
            mockFulfillmentQb.getMany.mockResolvedValue([
                { id: 'f-1', state: 'Pending' },
                { id: 'f-2', state: 'Shipped' },
            ]);
            mockOrderRepo.findOne.mockResolvedValue({
                id: 'order-1',
                customFields: { erpStatus: 'PENDING' },
            });

            await service.onFulfillmentStateChanged(mockCtx, { id: 'f-2' } as never);

            // Only the changed key — a stale erpStatus snapshot would overwrite a concurrent
            // write from updateStatus() below (#209).
            expect(mockOrderRepo.update).toHaveBeenCalledWith('order-1', {
                customFields: { latestFulfillmentState: 'Shipped' },
            });
        });

        it('updates every order a single Fulfillment covers, not just the first', async () => {
            mockFulfillmentRepo.findOne.mockResolvedValue({
                id: 'f-1',
                orders: [{ id: 'order-1' }, { id: 'order-2' }],
            });
            mockFulfillmentQb.getMany.mockResolvedValue([{ id: 'f-1', state: 'Delivered' }]);
            mockOrderRepo.findOne
                .mockResolvedValueOnce({ id: 'order-1', customFields: {} })
                .mockResolvedValueOnce({ id: 'order-2', customFields: {} });

            await service.onFulfillmentStateChanged(mockCtx, { id: 'f-1' } as never);

            expect(mockOrderRepo.update).toHaveBeenCalledTimes(2);
            expect(mockOrderRepo.update).toHaveBeenCalledWith('order-1', {
                customFields: { latestFulfillmentState: 'Delivered' },
            });
            expect(mockOrderRepo.update).toHaveBeenCalledWith('order-2', {
                customFields: { latestFulfillmentState: 'Delivered' },
            });
        });

        it('is a no-op when the fulfillment itself cannot be found', async () => {
            mockFulfillmentRepo.findOne.mockResolvedValue(null);

            await service.onFulfillmentStateChanged(mockCtx, { id: 'missing' } as never);

            expect(mockOrderRepo.update).not.toHaveBeenCalled();
        });
    });

    describe('updateStatus', () => {
        it('writes only the changed erp fields, never a stale customFields snapshot (#209)', async () => {
            mockOrderRepo.findOne.mockResolvedValue({
                id: 'order-1',
                code: 'ORD-1',
                // Fields another concurrent writer (ReservationExpiryService) could change
                // between this read and the write below — must survive untouched.
                customFields: { erpStatus: 'PENDING', reservationState: 'RESERVED' },
            });

            await service.updateStatus(mockCtx, { orderCode: 'ORD-1', status: 'CONFIRMED' });

            const [, update] = mockOrderRepo.update.mock.calls[0];
            expect(update.customFields).not.toHaveProperty('reservationState');
            expect(update.customFields).toEqual({
                erpStatus: 'CONFIRMED',
                erpStatusAt: expect.any(Date),
            });
        });

        it('includes erpOrderId only when the payload carries one', async () => {
            mockOrderRepo.findOne.mockResolvedValue({
                id: 'order-1',
                code: 'ORD-1',
                customFields: { erpStatus: 'PENDING' },
            });

            await service.updateStatus(mockCtx, {
                orderCode: 'ORD-1',
                status: 'CONFIRMED',
                erpOrderId: 'erp-9',
            });

            const [, update] = mockOrderRepo.update.mock.calls[0];
            expect(update.customFields.erpOrderId).toBe('erp-9');
        });

        it('is a no-op when the order cannot be found', async () => {
            mockOrderRepo.findOne.mockResolvedValue(null);

            await service.updateStatus(mockCtx, { orderCode: 'missing', status: 'CONFIRMED' });

            expect(mockOrderRepo.update).not.toHaveBeenCalled();
        });
    });
});
