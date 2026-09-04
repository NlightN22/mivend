import { describe, it, expect } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PriceStreamHandler } from '../../handlers/price.handler';

// PriceChanged has no known priceTypeId -> PriceType.code mapping yet (issue #63/#62 deferred
// design gap). This handler must never guess that mapping — it always resolves as a no-op skip,
// for any payload shape, so pricing data can never be silently corrupted. (Vendure's static
// `Logger` cannot be reliably spied on across the monorepo's shared test module graph, so the
// invariant under test is the observable one: no throw, no write, always resolves.)
describe('PriceStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('resolves as a no-op for any payload, never throwing or attempting a write', async () => {
        const handler = new PriceStreamHandler();

        await expect(
            handler.apply(ctx, 'price-1', {
                productId: 'prod-1',
                priceTypeId: '7',
                value: '199.90',
                currency: 'RUB',
                isActive: true,
                isDeleted: false,
            }),
        ).resolves.toBeUndefined();
    });

    it('resolves as a no-op even for an empty/malformed payload', async () => {
        const handler = new PriceStreamHandler();

        await expect(handler.apply(ctx, 'price-2', {})).resolves.toBeUndefined();
    });
});
