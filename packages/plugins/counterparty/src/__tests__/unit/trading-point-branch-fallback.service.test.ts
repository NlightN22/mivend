import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CustomerService, RequestContext, TransactionalConnection } from '@vendure/core';
import { TradingPointService } from '../../trading-point.service';

const rawQuery = vi.fn();
const getGlobalDefaultBranchId = vi.fn();
const connection = { rawConnection: { query: rawQuery } };
const ctx = {} as RequestContext;
const point = (servicingBranchId: string | null) => ({ servicingBranchId, counterpartyId: '5' });

describe('TradingPointService.resolveServicingBranchId', () => {
    let service: TradingPointService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new TradingPointService(
            connection as unknown as TransactionalConnection,
            {} as CustomerService,
            {} as never,
            {} as never,
            { getGlobalDefaultBranchId } as never,
        );
    });

    it("prefers the point's own branch without touching the database", async () => {
        expect(await service.resolveServicingBranchId(ctx, point('branch-a'))).toBe('branch-a');
        expect(rawQuery).not.toHaveBeenCalled();
    });

    it("falls back to the counterparty's branch", async () => {
        rawQuery.mockResolvedValue([{ branchId: 'branch-b' }]);
        expect(await service.resolveServicingBranchId(ctx, point(null))).toBe('branch-b');
        expect(getGlobalDefaultBranchId).not.toHaveBeenCalled();
    });

    it('falls back to the global default branch when neither is set', async () => {
        rawQuery.mockResolvedValue([{ branchId: null }]);
        getGlobalDefaultBranchId.mockResolvedValue('branch-default');
        expect(await service.resolveServicingBranchId(ctx, point(null))).toBe('branch-default');
    });

    it('returns null when no branch can be resolved anywhere', async () => {
        rawQuery.mockResolvedValue([]);
        getGlobalDefaultBranchId.mockResolvedValue(null);
        expect(await service.resolveServicingBranchId(ctx, point(null))).toBeNull();
    });
});
