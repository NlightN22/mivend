import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PriceHandler } from '../../handlers/price.handler';

describe('erp-import PriceHandler', () => {
    it('stores the price in cents by product ERP id, with no product lookup (#297)', async () => {
        const priceEntryService = { upsertByProduct: vi.fn().mockResolvedValue(undefined) };
        const handler = new PriceHandler(priceEntryService as never);
        const ctx = {} as RequestContext;

        await handler.upsert(ctx, {
            productExternalId: 'erp-1',
            priceTypeCode: 'RETAIL',
            price: 99.9,
        });

        expect(priceEntryService.upsertByProduct).toHaveBeenCalledWith(
            ctx,
            'erp-1',
            'RETAIL',
            9990,
        );
    });
});
