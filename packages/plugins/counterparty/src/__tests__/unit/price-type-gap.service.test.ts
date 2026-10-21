import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PriceTypeGapService } from '../../price-type-gap.service';

function makeQb() {
    const qb = {
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
    };
    return qb;
}

describe('PriceTypeGapService.findPage', () => {
    it('starts from the caller-scoped counterparty query', async () => {
        const qb = makeQb();
        const counterpartyService = { visibleFilteredQb: vi.fn().mockResolvedValue(qb) };
        const service = new PriceTypeGapService({} as never, counterpartyService as never);
        const ctx = {} as RequestContext;
        await service.findPage(ctx, {});
        expect(counterpartyService.visibleFilteredQb).toHaveBeenCalledWith(ctx, {});
    });

    it('clamps paging and escapes LIKE wildcards in the search term', async () => {
        const qb = makeQb();
        const service = new PriceTypeGapService(
            {} as never,
            { visibleFilteredQb: vi.fn().mockResolvedValue(qb) } as never,
        );
        await service.findPage({} as RequestContext, { take: -5, skip: -3, search: '50%_x' });
        expect(qb.take).toHaveBeenCalledWith(1);
        expect(qb.skip).toHaveBeenCalledWith(0);
        expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), {
            term: '%50\\%\\_x%',
        });
    });
});
