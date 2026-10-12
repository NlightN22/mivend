import { RequestContext, TransactionalConnection } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { VariantSalesUnitService } from '../../variant-sales-unit.service';

function makeService(rows: unknown[]): {
    service: VariantSalesUnitService;
    where: ReturnType<typeof vi.fn>;
} {
    const where = vi.fn().mockReturnThis();
    const builder = {
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where,
        getRawMany: vi.fn(async () => rows),
    };
    const connection = {
        getRepository: () => ({ createQueryBuilder: () => builder }),
    } as unknown as TransactionalConnection;
    return { service: new VariantSalesUnitService(connection), where };
}

describe('VariantSalesUnitService', () => {
    it('filters out non-numeric ids and still resolves the valid ones', async () => {
        const { service, where } = makeService([
            { id: 5, unitName: 'pack', unitRatioToBase: 6, multiplicity: null },
        ]);
        const ctx = {} as RequestContext;

        const [good, bad] = await Promise.all([service.load(ctx, '5'), service.load(ctx, 'x1')]);

        expect(where).toHaveBeenCalledWith('pv.id IN (:...ids)', { ids: ['5'] });
        expect(good?.unitName).toBe('pack');
        expect(bad).toBeNull();
    });

    it('skips the query when no id is numeric', async () => {
        const { service, where } = makeService([]);
        expect(await service.load({} as RequestContext, '')).toBeNull();
        expect(where).not.toHaveBeenCalled();
    });
});
