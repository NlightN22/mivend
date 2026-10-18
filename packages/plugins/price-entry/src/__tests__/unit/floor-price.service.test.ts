import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { FloorPriceService } from '../../floor-price.service';

const ctx = {} as RequestContext;

function make(type: unknown, purchase: Map<string, number>) {
    const connection = { getRepository: () => ({ findOne: vi.fn(async () => type) }) };
    const entries = { getForVariants: vi.fn(async () => purchase) };
    return new FloorPriceService(connection as never, entries as never);
}

describe('FloorPriceService.forVariants', () => {
    it('multiplies the purchase price by the multiplier of the purchase type', async () => {
        const svc = make({ code: 'p', ceilingMultiplier: 1.5 }, new Map([['v1', 100]]));
        expect((await svc.forVariants(ctx, ['v1', 'v2'])).get('v1')).toBe(150);
    });

    it('has no floor for a variant without a purchase entry', async () => {
        const svc = make({ code: 'p', ceilingMultiplier: 1.5 }, new Map());
        expect((await svc.forVariants(ctx, ['v1'])).size).toBe(0);
    });

    it('has no floor without a purchase type or multiplier', async () => {
        expect((await make(null, new Map([['v1', 1]])).forVariants(ctx, ['v1'])).size).toBe(0);
        const noMult = make({ code: 'p', ceilingMultiplier: null }, new Map([['v1', 1]]));
        expect((await noMult.forVariants(ctx, ['v1'])).size).toBe(0);
    });
});
