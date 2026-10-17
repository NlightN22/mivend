import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext } from '@vendure/core';
import { OrderDeliveryEditService } from '../../order-delivery-edit.service';

vi.mock('shared', () => ({
    FREIGHT_SHIPPING_METHOD_CODE: 'freight-delivery',
    PICKUP_SHIPPING_METHOD_CODE: 'pickup',
    withAggregateLock: (_c: unknown, ctx: unknown, _k: unknown, work: (c: unknown) => unknown) =>
        work(ctx),
}));

vi.mock('../../order-line-edit.guard', () => ({ OrderLineEditGuard: class {} }));
vi.mock('@mivend/plugin-erp-order', () => ({ OrderVisibilityService: class {} }));

const ctx = {} as RequestContext;
const orderRepo = { createQueryBuilder: vi.fn(), update: vi.fn() };
const lockedQb = { setLock: vi.fn(), where: vi.fn(), getOne: vi.fn() };
const methodRepo = { findOne: vi.fn() };
const lineRepo = { find: vi.fn(), update: vi.fn() };
const connection = {
    getRepository: vi.fn((_c: unknown, entity: { name: string }) =>
        entity.name === 'ShippingMethod'
            ? methodRepo
            : entity.name === 'ShippingLine'
              ? lineRepo
              : orderRepo,
    ),
};
const visibleQb = { alias: 'order', andWhere: vi.fn(), getOne: vi.fn() };
const visibility = { buildVisibleOrdersQuery: vi.fn() };
const guard = { assertEditable: vi.fn() };
const history = { createHistoryEntryForOrder: vi.fn() };
const tradingPoints = { findVisibleForCounterparty: vi.fn() };
const counterparties = { getForCustomer: vi.fn() };
const point = { id: 9, name: 'North Depot', address: 'North Ave 42' };

describe('OrderDeliveryEditService.setDelivery', () => {
    let service: OrderDeliveryEditService;

    beforeEach(() => {
        vi.resetAllMocks();
        connection.getRepository.mockImplementation((_c: unknown, entity: { name: string }) =>
            entity.name === 'ShippingMethod'
                ? methodRepo
                : entity.name === 'ShippingLine'
                  ? lineRepo
                  : orderRepo,
        );
        visibility.buildVisibleOrdersQuery.mockResolvedValue(visibleQb);
        visibleQb.andWhere.mockReturnValue(visibleQb);
        visibleQb.getOne.mockResolvedValue({ id: 1 });
        orderRepo.createQueryBuilder.mockReturnValue(lockedQb);
        lockedQb.setLock.mockReturnValue(lockedQb);
        lockedQb.where.mockReturnValue(lockedQb);
        lockedQb.getOne.mockResolvedValue({ id: 1, customerId: 'cust-1' });
        counterparties.getForCustomer.mockResolvedValue({ id: 5 });
        tradingPoints.findVisibleForCounterparty.mockResolvedValue([point]);
        methodRepo.findOne.mockResolvedValue({ id: 70 });
        lineRepo.find.mockResolvedValue([{ id: 3 }]);
        service = new OrderDeliveryEditService(
            connection as never,
            visibility as never,
            guard as never,
            history as never,
            tradingPoints as never,
            counterparties as never,
        );
    });

    it("switches to courier: shipping line, the client's own point and its address snapshot, with a history note", async () => {
        await service.setDelivery(ctx, 1, 'COURIER', '9');
        expect(lineRepo.update).toHaveBeenCalledTimes(1);
        expect(orderRepo.update).toHaveBeenCalledWith(1, {
            customFields: { tradingPointId: '9', deliveryAddress: 'North Ave 42' },
        });
        expect(history.createHistoryEntryForOrder).toHaveBeenCalledTimes(1);
        expect(guard.assertEditable).toHaveBeenCalledTimes(1);
    });

    it('switches to self-pickup: clears the point and address together with the shipping line', async () => {
        await service.setDelivery(ctx, 1, 'PICKUP', '9');
        expect(lineRepo.update).toHaveBeenCalledTimes(1);
        expect(orderRepo.update).toHaveBeenCalledWith(1, {
            customFields: { tradingPointId: null, deliveryAddress: null },
        });
    });

    it('writes nothing when the order was already sent to the ERP', async () => {
        guard.assertEditable.mockRejectedValue(new Error('sent'));
        await expect(service.setDelivery(ctx, 1, 'COURIER', '9')).rejects.toThrow('sent');
        expect(orderRepo.update).not.toHaveBeenCalled();
        expect(lineRepo.update).not.toHaveBeenCalled();
    });

    it('refuses a point that is not one of the order client points', async () => {
        await expect(service.setDelivery(ctx, 1, 'COURIER', '77')).rejects.toThrow(/not one of/);
        expect(orderRepo.update).not.toHaveBeenCalled();
        expect(lineRepo.update).not.toHaveBeenCalled();
    });

    it('refuses courier without a point and an order outside the visibility scope', async () => {
        await expect(service.setDelivery(ctx, 1, 'COURIER', null)).rejects.toThrow(
            /needs a trading point/,
        );
        visibleQb.getOne.mockResolvedValue(null);
        await expect(service.setDelivery(ctx, 1, 'PICKUP', null)).rejects.toThrow(
            'Order not found',
        );
        expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('takes the row lock before the editability check', async () => {
        await service.setDelivery(ctx, 1, 'PICKUP', null);
        expect(lockedQb.setLock).toHaveBeenCalledWith('pessimistic_write');
    });
});
