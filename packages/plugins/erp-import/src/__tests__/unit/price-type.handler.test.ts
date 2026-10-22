import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { PriceTypeHandler } from '../../handlers/price-type.handler';

const ctx = {} as RequestContext;

function build() {
    const service = { upsertPriceTypeByCode: vi.fn(async () => ({})) };
    return { handler: new PriceTypeHandler(service as never), service };
}

describe('PriceTypeHandler', () => {
    it('upserts a customer type by code with no purchase rule', async () => {
        const { handler, service } = build();
        await handler.upsert(ctx, { code: 'pt-a', name: 'A', visibility: 'customer' });
        expect(service.upsertPriceTypeByCode).toHaveBeenCalledWith(ctx, 'pt-a', 'A', 'customer', {
            isPurchase: false,
            ceilingMultiplier: null,
        });
    });

    it('passes the purchase rule for the purchase type', async () => {
        const { handler, service } = build();
        await handler.upsert(ctx, {
            code: 'pt-buy',
            name: 'Buy',
            visibility: 'confidential',
            isPurchase: true,
            ceilingMultiplier: 1.5,
        });
        expect(service.upsertPriceTypeByCode).toHaveBeenCalledWith(
            ctx,
            'pt-buy',
            'Buy',
            'confidential',
            {
                isPurchase: true,
                ceilingMultiplier: 1.5,
            },
        );
    });

    it('rejects an unknown visibility instead of storing it', async () => {
        const { handler, service } = build();
        await expect(
            handler.upsert(ctx, { code: 'x', name: 'X', visibility: 'public' as never }),
        ).rejects.toThrow(/unknown visibility/);
        expect(service.upsertPriceTypeByCode).not.toHaveBeenCalled();
    });
});
