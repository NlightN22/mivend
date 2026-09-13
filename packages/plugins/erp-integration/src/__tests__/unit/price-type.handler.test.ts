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

    // Integration Service encodes isActive/isDeleted as plain proto3 bool (not optional) — proto3
    // JSON encoding omits a scalar field when it equals its zero-value, so `isActive:false` is
    // NEVER sent as an explicit false, only as an absent key (confirmed live with Search Platform,
    // see mivend#89's follow-up investigation). Absent must be read as false, not true — the
    // previous `!== false` check could never detect a real deactivation at all.
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
