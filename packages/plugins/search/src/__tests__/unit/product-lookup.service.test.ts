import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ProductLookupService } from '../../product-lookup.service';
import { variantExistsSql } from '../../variant-exists-sql';

function makeService(products: unknown[]): {
    service: ProductLookupService;
    andWhere: ReturnType<typeof vi.fn>;
} {
    const andWhere = vi.fn();
    const qb: Record<string, unknown> = { andWhere, getMany: vi.fn().mockResolvedValue(products) };
    for (const m of ['leftJoinAndSelect', 'innerJoin', 'where'])
        qb[m] = vi.fn().mockReturnValue(qb);
    andWhere.mockReturnValue(qb);
    const connection = {
        getRepository: () => ({ createQueryBuilder: () => qb }),
    } as unknown as TransactionalConnection;
    return { service: new ProductLookupService(connection), andWhere };
}

const ctx = { channelId: 1 } as unknown as RequestContext;

describe('ProductLookupService.findByExternalIds', () => {
    it('excludes soft-deleted and disabled products by default', async () => {
        const { service, andWhere } = makeService([]);
        await service.findByExternalIds(ctx, ['ext-001']);
        expect(andWhere).toHaveBeenCalledWith('product.deletedAt IS NULL');
        expect(andWhere).toHaveBeenCalledWith('product.enabled = true');
    });

    it('requires a sellable variant (with an organization) for the shop view only', async () => {
        const shop = makeService([]);
        await shop.service.findByExternalIds(ctx, ['ext-001']);
        expect(shop.andWhere).toHaveBeenCalledWith(variantExistsSql(true));

        const staff = makeService([]);
        await staff.service.findByExternalIds(ctx, ['ext-001'], true);
        expect(staff.andWhere).not.toHaveBeenCalledWith(variantExistsSql(true));
    });

    it('still excludes soft-deleted but keeps disabled products when includeDisabled', async () => {
        const { service, andWhere } = makeService([]);
        await service.findByExternalIds(ctx, ['ext-001'], true);
        expect(andWhere).toHaveBeenCalledWith('product.deletedAt IS NULL');
        expect(andWhere).not.toHaveBeenCalledWith('product.enabled = true');
    });

    it('returns an empty map without querying for no ids, and keys results by externalId', async () => {
        const { service } = makeService([{ id: 1, customFields: { externalId: 'ext-001' } }]);
        expect((await service.findByExternalIds(ctx, [])).size).toBe(0);
        expect([...(await service.findByExternalIds(ctx, ['ext-001'])).keys()]).toEqual([
            'ext-001',
        ]);
    });
});
