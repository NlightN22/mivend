import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ProductManufacturerService } from '../../product-manufacturer.service';

function setup(products: unknown[]) {
    const find = vi.fn().mockResolvedValue(products);
    const connection = { getRepository: () => ({ find }) };
    const service = new ProductManufacturerService(connection as never);
    return { service, find, ctx: {} as RequestContext };
}

describe('ProductManufacturerService', () => {
    it('batches per-product lookups of one request into a single query', async () => {
        const { service, find, ctx } = setup([
            { id: 1, customFields: { manufacturer: { id: 7, name: 'Maker' } } },
            { id: 2, customFields: { manufacturer: null } },
        ]);

        const results = await Promise.all([
            service.getForProduct(ctx, 1),
            service.getForProduct(ctx, 2),
            service.getForProduct(ctx, 3),
        ]);

        expect(find).toHaveBeenCalledTimes(1);
        expect(results).toEqual([{ id: 7, name: 'Maker' }, null, null]);
    });
});
