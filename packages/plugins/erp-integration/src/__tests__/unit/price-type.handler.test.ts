import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PriceTypeStreamHandler } from '../../handlers/price-type.handler';

describe('PriceTypeStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when name is missing', async () => {
        const customerPricingService = { upsertPriceTypeByExternalId: vi.fn() };
        const handler = new PriceTypeStreamHandler(customerPricingService as never);

        await handler.apply(ctx, 'guid-1', { isActive: true });

        expect(customerPricingService.upsertPriceTypeByExternalId).not.toHaveBeenCalled();
    });

    it('upserts by externalId, defaulting isActive to true when absent', async () => {
        const customerPricingService = {
            upsertPriceTypeByExternalId: vi.fn().mockResolvedValue({}),
        };
        const handler = new PriceTypeStreamHandler(customerPricingService as never);

        await handler.apply(ctx, 'guid-1', { name: 'Wholesale' });

        expect(customerPricingService.upsertPriceTypeByExternalId).toHaveBeenCalledWith(
            ctx,
            'guid-1',
            'Wholesale',
            true,
        );
    });

    it('passes isActive=false through when explicitly set', async () => {
        const customerPricingService = {
            upsertPriceTypeByExternalId: vi.fn().mockResolvedValue({}),
        };
        const handler = new PriceTypeStreamHandler(customerPricingService as never);

        await handler.apply(ctx, 'guid-1', { name: 'Wholesale', isActive: false });

        expect(customerPricingService.upsertPriceTypeByExternalId).toHaveBeenCalledWith(
            ctx,
            'guid-1',
            'Wholesale',
            false,
        );
    });
});
