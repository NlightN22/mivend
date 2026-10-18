import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext } from '@vendure/core';
import { DraftOrderDeliveryService } from '../../draft-order-delivery.service';

vi.mock('shared', async importOriginal => ({
    ...(await importOriginal<typeof import('shared')>()),
    withAggregateLock: (_c: unknown, ctx: unknown, _key: unknown, work: (c: unknown) => unknown) =>
        work(ctx),
}));

const ctx = {} as RequestContext;
const orderRepo = { createQueryBuilder: vi.fn(), update: vi.fn() };
const lockedQb = { setLock: vi.fn(), where: vi.fn(), getOne: vi.fn() };
const visibleQb = { alias: 'order', andWhere: vi.fn(), getOne: vi.fn() };
const connection = { getRepository: vi.fn(() => orderRepo) };
const visibility = { buildVisibleOrdersQuery: vi.fn() };
const tradingPoints = { findVisibleForCounterparty: vi.fn() };
const counterparties = { getForCustomer: vi.fn() };

const draft = {
    id: 1,
    state: 'Draft',
    customerId: 'cust-1',
    customFields: { counterpartyId: '5' },
};
const own = { id: 9, address: 'Chosen 2' };

describe('DraftOrderDeliveryService.setTradingPoint', () => {
    let service: DraftOrderDeliveryService;

    beforeEach(() => {
        vi.resetAllMocks();
        visibility.buildVisibleOrdersQuery.mockResolvedValue(visibleQb);
        visibleQb.andWhere.mockReturnValue(visibleQb);
        visibleQb.getOne.mockResolvedValue({ id: 1 });
        connection.getRepository.mockReturnValue(orderRepo);
        orderRepo.createQueryBuilder.mockReturnValue(lockedQb);
        lockedQb.setLock.mockReturnValue(lockedQb);
        lockedQb.where.mockReturnValue(lockedQb);
        lockedQb.getOne.mockResolvedValue(draft);
        tradingPoints.findVisibleForCounterparty.mockResolvedValue([own]);
        service = new DraftOrderDeliveryService(
            connection as never,
            visibility as never,
            tradingPoints as never,
            counterparties as never,
        );
    });

    it("stores the id and the address of one of the order's own points, writing only those keys", async () => {
        await service.setTradingPoint(ctx, 1, '9');
        expect(tradingPoints.findVisibleForCounterparty).toHaveBeenCalledWith(ctx, '5');
        expect(orderRepo.update).toHaveBeenCalledWith(1, {
            customFields: { tradingPointId: '9', deliveryAddress: 'Chosen 2' },
        });
    });

    it('rejects a point of another counterparty and writes nothing', async () => {
        await expect(service.setTradingPoint(ctx, 1, '77')).rejects.toThrow(/not one of/);
        expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('takes the counterparty from the customer when the draft has none yet', async () => {
        lockedQb.getOne.mockResolvedValue({ ...draft, customFields: {} });
        counterparties.getForCustomer.mockResolvedValue({ id: 6 });
        await service.setTradingPoint(ctx, 1, '9');
        expect(tradingPoints.findVisibleForCounterparty).toHaveBeenCalledWith(ctx, '6');
    });

    it('clears the point and address when null is passed (self-pickup)', async () => {
        await service.setTradingPoint(ctx, 1, null);
        expect(orderRepo.update).toHaveBeenCalledWith(1, {
            customFields: { tradingPointId: null, deliveryAddress: null },
        });
    });

    it('refuses an order outside the visibility scope', async () => {
        visibleQb.getOne.mockResolvedValue(null);
        await expect(service.setTradingPoint(ctx, 1, '9')).rejects.toThrow('Order not found');
        expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('refuses an order that is no longer a draft, re-checked under the lock', async () => {
        lockedQb.getOne.mockResolvedValue({ ...draft, state: 'ArrangingPayment' });
        await expect(service.setTradingPoint(ctx, 1, '9')).rejects.toThrow(/draft/);
        expect(lockedQb.setLock).toHaveBeenCalledWith('pessimistic_write');
        expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('refuses a draft without a customer', async () => {
        lockedQb.getOne.mockResolvedValue({ ...draft, customerId: null, customFields: {} });
        await expect(service.setTradingPoint(ctx, 1, '9')).rejects.toThrow(/customer/);
    });
});
