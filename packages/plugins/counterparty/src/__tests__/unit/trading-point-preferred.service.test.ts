import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CustomerService, RequestContext, TransactionalConnection } from '@vendure/core';
import { TradingPointService } from '../../trading-point.service';

const rawQuery = vi.fn();
const findOne = vi.fn();
const connection = {
    getRepository: (_ctx: unknown, entity: unknown) =>
        entity === 'Channel' ? { query: rawQuery } : { findOne },
};

describe('TradingPointService.getPreferredForCustomer', () => {
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

    it('returns the point the self-healing update settled on', async () => {
        rawQuery.mockResolvedValue([[{ tpid: '7' }], 1]);
        findOne.mockResolvedValue({ id: '7' });
        expect(await service.getPreferredForCustomer({} as RequestContext, 2)).toEqual({ id: '7' });
        expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: '7' } }));
    });

    it('returns null when the counterparty has no usable point', async () => {
        rawQuery.mockResolvedValue([[{ tpid: null }], 1]);
        expect(await service.getPreferredForCustomer({} as RequestContext, 2)).toBeNull();
        expect(findOne).not.toHaveBeenCalled();
    });

    it('returns null for an unknown customer', async () => {
        rawQuery.mockResolvedValue([[], 0]);
        expect(await service.getPreferredForCustomer({} as RequestContext, 99)).toBeNull();
    });
});

describe('TradingPointService.setPreferred', () => {
    const update = vi.fn();
    let service: TradingPointService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new TradingPointService(
            connection as unknown as TransactionalConnection,
            { update } as unknown as CustomerService,
            {} as never,
            {} as never,
            {} as never,
        );
    });

    it("stores a visible point of the customer's own counterparty", async () => {
        rawQuery.mockResolvedValue([{ id: '7' }]);
        await service.setPreferred({} as RequestContext, 2, 7);
        expect(rawQuery.mock.calls[0][1]).toEqual([2, '7']);
        expect(update).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ id: 2, customFields: { preferredTradingPointId: '7' } }),
        );
    });

    it('rejects a point outside the visible set and changes nothing', async () => {
        rawQuery.mockResolvedValue([]);
        await expect(service.setPreferred({} as RequestContext, 2, 9)).rejects.toThrow();
        expect(update).not.toHaveBeenCalled();
    });
});
