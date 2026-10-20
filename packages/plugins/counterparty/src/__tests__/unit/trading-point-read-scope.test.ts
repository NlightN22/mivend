import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CustomerService, RequestContext, TransactionalConnection } from '@vendure/core';
import { TradingPointService } from '../../trading-point.service';
import { TradingPointAdminResolver } from '../../trading-point.resolver';
import type { CounterpartyService } from '../../counterparty.service';

const findOne = vi.fn();
const rawQuery = vi.fn();
const connection = {
    getRepository: (_ctx: unknown, entity: unknown) =>
        entity === 'Channel' ? { query: rawQuery } : { findOne },
};
const guest = { activeUserId: undefined } as unknown as RequestContext;
const customer = { activeUserId: 5 } as unknown as RequestContext;

describe('TradingPointService.findOwnById (Shop API)', () => {
    let service: TradingPointService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new TradingPointService(
            connection as unknown as TransactionalConnection,
            {} as CustomerService,
            {} as never,
            {} as never,
            {} as never,
        );
    });

    it('returns null for a guest without touching the database', async () => {
        expect(await service.findOwnById(guest, '1')).toBeNull();
        expect(findOne).not.toHaveBeenCalled();
    });

    it('returns null when the customer has no counterparty', async () => {
        rawQuery.mockResolvedValue([{ cid: null }]);
        expect(await service.findOwnById(customer, '1')).toBeNull();
        expect(findOne).not.toHaveBeenCalled();
    });

    it('scopes the lookup to the own counterparty and active points', async () => {
        rawQuery.mockResolvedValue([{ cid: 'cp-1' }]);
        findOne.mockResolvedValue({ id: '1' });
        expect(await service.findOwnById(customer, '1')).toEqual({ id: '1' });
        expect(findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: '1', counterpartyId: 'cp-1', isActive: true },
            }),
        );
    });

    it('returns null for another counterparty, an inactive point or an unknown id', async () => {
        rawQuery.mockResolvedValue([{ cid: 'cp-1' }]);
        findOne.mockResolvedValue(null);
        expect(await service.findOwnById(customer, '999')).toBeNull();
    });
});

describe('TradingPointAdminResolver.tradingPoint (Admin API)', () => {
    const findById = vi.fn();
    const findOneVisible = vi.fn();
    const resolver = new TradingPointAdminResolver(
        { findById } as unknown as TradingPointService,
        { findOneVisible } as unknown as CounterpartyService,
    );

    beforeEach(() => vi.clearAllMocks());

    it('returns the point when its counterparty is in the caller scope', async () => {
        findById.mockResolvedValue({ id: '1', counterpartyId: 'cp-1' });
        findOneVisible.mockResolvedValue({ id: 'cp-1' });
        expect(await resolver.tradingPoint(customer, { id: '1' })).toEqual({
            id: '1',
            counterpartyId: 'cp-1',
        });
    });

    it('returns null when the counterparty is outside the caller scope', async () => {
        findById.mockResolvedValue({ id: '1', counterpartyId: 'cp-2' });
        findOneVisible.mockResolvedValue(null);
        expect(await resolver.tradingPoint(customer, { id: '1' })).toBeNull();
    });

    it('returns null for an unknown id', async () => {
        findById.mockResolvedValue(null);
        expect(await resolver.tradingPoint(customer, { id: '9' })).toBeNull();
        expect(findOneVisible).not.toHaveBeenCalled();
    });
});

describe('TradingPointService.updateDeliveryComment scope', () => {
    const update = vi.fn();
    const assertCounterpartyWritable = vi.fn();
    const repo = { findOne, update };
    const conn = { getRepository: () => repo };
    const service = new TradingPointService(
        conn as unknown as TransactionalConnection,
        {} as CustomerService,
        { assertCounterpartyWritable } as never,
        {} as never,
        {} as never,
    );

    beforeEach(() => vi.clearAllMocks());

    it('does not write when the counterparty is outside the staff scope', async () => {
        findOne.mockResolvedValue({ id: '1', counterpartyId: 'cp-2' });
        assertCounterpartyWritable.mockRejectedValue(new Error('forbidden'));
        await expect(service.updateDeliveryComment(customer, '1', 'x')).rejects.toThrow(
            'forbidden',
        );
        expect(update).not.toHaveBeenCalled();
    });

    it('writes the comment when in scope', async () => {
        findOne.mockResolvedValue({ id: '1', counterpartyId: 'cp-1' });
        assertCounterpartyWritable.mockResolvedValue(undefined);
        await service.updateDeliveryComment(customer, '1', 'x');
        expect(update).toHaveBeenCalledWith({ id: '1' }, { deliveryComment: 'x' });
    });
});
