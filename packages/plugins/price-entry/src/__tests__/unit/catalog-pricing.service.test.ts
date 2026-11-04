import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { CatalogPricingService } from '../../catalog-pricing.service';
import type { DiscountSetupRulesService } from '../../discount-setup-rules.service';
import type { PriceEntryService } from '../../price-entry.service';
import type { PriceResolutionService } from '../../price-resolution.service';

function build(failFor: string[] = []) {
    const find = vi.fn(async () => []);
    const connection = { getRepository: () => ({ find }) } as unknown as TransactionalConnection;
    const resolution = {
        catalogPricingScope: vi.fn(async () => ({
            userCode: null,
            defaultCode: null,
            counterparty: null,
        })),
        resolve: vi.fn(async (ctx: { who: string }, id: string) => {
            if (failFor.includes(id)) throw new Error(`boom ${id}`);
            return { customerPrice: Number(id), compareAtPrice: null, who: ctx.who };
        }),
        resolveTiers: vi.fn(async () => []),
    };
    const service = new CatalogPricingService(
        resolution as unknown as PriceResolutionService,
        {} as PriceEntryService,
        {} as DiscountSetupRulesService,
        connection,
    );
    return { service, resolution, find };
}
const ctxOf = (who: string): RequestContext => ({ who }) as unknown as RequestContext;

describe('CatalogPricingService batching', () => {
    it('resolves each variant once per request however many fields ask, in one preload', async () => {
        const { service, resolution, find } = build();
        const ctx = ctxOf('a');
        await Promise.all(['1', '2', '1', '1', '3', '2'].map(id => service.get(ctx, id)));
        expect(resolution.resolve).toHaveBeenCalledTimes(3);
        expect(resolution.resolveTiers).toHaveBeenCalledTimes(3);
        expect(resolution.catalogPricingScope).toHaveBeenCalledTimes(1);
        expect(find).toHaveBeenCalledTimes(1);
    });

    it('rejects only the failing variant and keeps the others', async () => {
        const { service } = build(['2']);
        const ctx = ctxOf('a');
        const results = await Promise.allSettled(['1', '2', '3'].map(id => service.get(ctx, id)));
        expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
        expect((results[1] as PromiseRejectedResult).reason.message).toBe('boom 2');
    });

    it('never shares a result between requests', async () => {
        const { service, resolution } = build();
        const [a, b] = await Promise.all([
            service.get(ctxOf('a'), '1'),
            service.get(ctxOf('b'), '1'),
        ]);
        expect(resolution.resolve).toHaveBeenCalledTimes(2);
        expect((a.price as unknown as { who: string }).who).toBe('a');
        expect((b.price as unknown as { who: string }).who).toBe('b');
    });
});
