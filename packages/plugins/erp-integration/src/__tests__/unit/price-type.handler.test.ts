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
            { isPurchase: false, ceilingMultiplier: null },
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
            { isPurchase: false, ceilingMultiplier: null },
        );
    });
});

describe('PriceTypeStreamHandler purchase rule', () => {
    const ctx = {} as RequestContext;
    const run = async (payload: Record<string, unknown>) => {
        const svc = { upsertPriceTypeByExternalId: vi.fn().mockResolvedValue({}) };
        await new PriceTypeStreamHandler(svc as never).apply(ctx, 'g', { name: 'N', ...payload });
        return svc.upsertPriceTypeByExternalId.mock.calls[0][4];
    };

    it('passes the purchase flag and multiplier through', async () => {
        expect(await run({ isPurchasePriceType: true, ceilingPriceMultiplier: 1.25 })).toEqual({
            isPurchase: true,
            ceilingMultiplier: 1.25,
        });
    });

    it('treats an absent flag as non-purchase and drops an invalid multiplier', async () => {
        expect(await run({ ceilingPriceMultiplier: 0 })).toEqual({
            isPurchase: false,
            ceilingMultiplier: null,
        });
    });
});
