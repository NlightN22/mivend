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

    // Proto3 JSON omits zero-value scalars: isActive:false arrives as an absent key, not false.
    // Treat absent as false; an '!== false' check can never detect a real deactivation.
    it('defaults isActive to false when absent (proto3 omits the false zero-value)', async () => {
        const customerPricingService = {
            upsertPriceTypeByExternalId: vi.fn().mockResolvedValue({}),
        };
        const handler = new PriceTypeStreamHandler(customerPricingService as never);

        await handler.apply(ctx, 'guid-1', { name: 'Wholesale' });

        expect(customerPricingService.upsertPriceTypeByExternalId).toHaveBeenCalledWith(
            ctx,
            'guid-1',
            'Wholesale',
            false,
        );
    });

    it('passes isActive=true through when explicitly set', async () => {
        const customerPricingService = {
            upsertPriceTypeByExternalId: vi.fn().mockResolvedValue({}),
        };
        const handler = new PriceTypeStreamHandler(customerPricingService as never);

        await handler.apply(ctx, 'guid-1', { name: 'Wholesale', isActive: true });

        expect(customerPricingService.upsertPriceTypeByExternalId).toHaveBeenCalledWith(
            ctx,
            'guid-1',
            'Wholesale',
            true,
        );
    });
});
