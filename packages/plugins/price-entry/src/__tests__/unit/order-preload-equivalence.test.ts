import { describe, expect, it, vi } from 'vitest';
import { Order, ProductVariant, RequestContext, TransactionalConnection } from '@vendure/core';

import { LookupMemo } from '../../lookup-memo';
import { DiscountSetupRulesService } from '../../discount-setup-rules.service';
import { PromoDiscountRuleService } from '../../promo-discount-rule.service';
import { PriceResolutionService } from '../../price-resolution.service';

const ctx = { languageCode: 'en' } as unknown as RequestContext;

const variants = [
    ['v1', 'erp-a'],
    ['v2', 'erp-b'],
    ['v3', 'erp-c'],
    ['v4', ''],
].map(([id, externalId]) => ({
    id,
    facetValues: [],
    customFields: { weight: 1 },
    product: { facetValues: [], customFields: { externalId } },
}));

const rules = [
    { triggerProductErpId: 'erp-a', triggerQuantity: 2, giftProductErpId: null, percent: 10 },
    { triggerProductErpId: 'erp-a', triggerQuantity: 2, giftProductErpId: 'erp-b', percent: 50 },
];
const prices: Record<string, Record<string, number>> = {
    WHOLESALE: { v1: 1000, v2: 500, v4: 300 },
    RETAIL: { v3: 700 },
};

function qb() {
    const params: Record<string, unknown> = {};
    const builder = {
        where: (_sql: string, p: Record<string, unknown>) => Object.assign(params, p) && builder,
        andWhere: (_sql: string, p?: Record<string, unknown>) =>
            Object.assign(params, p) && builder,
        getMany: async () => {
            const ids = (params.erpIds as string[] | undefined) ?? [params.productErpId as string];
            return rules.filter(
                r => ids.includes(r.triggerProductErpId) || ids.includes(r.giftProductErpId ?? ''),
            );
        },
    };
    return builder;
}

const connection = {
    getRepository: (_c: unknown, entity: unknown) =>
        entity === ProductVariant
            ? {
                  findOne: async ({ where: { id } }: { where: { id: string } }) =>
                      variants.find(v => v.id === id) ?? null,
                  find: async ({ where: { id } }: { where: { id: { value: string[] } } }) =>
                      variants.filter(v => id.value.includes(v.id)),
              }
            : { createQueryBuilder: qb },
} as unknown as TransactionalConnection;

const priceEntry = {
    getPriceTypeCodeForCustomer: vi.fn(async () => 'WHOLESALE'),
    getPriceTypeCodeById: vi.fn(async () => 'RETAIL'),
    getForVariant: async (_c: unknown, id: string, code: string) => prices[code]?.[id] ?? null,
    getForVariants: vi.fn(
        async (_c: unknown, ids: string[], code: string) =>
            new Map(
                ids
                    .filter(id => prices[code]?.[id] !== undefined)
                    .map(id => [id, prices[code][id]]),
            ),
    ),
};

const service = new PriceResolutionService(
    priceEntry as never,
    { getBestPercent: async () => null } as never,
    connection,
    {} as never,
    { getForCustomer: async () => null } as never,
    { resolveEffective: async () => ({ defaultPriceTypeId: 1 }) } as never,
    new PromoDiscountRuleService(connection),
    new DiscountSetupRulesService(connection),
);

// two lines of v1, a variant without a price for the customer's type, a product without externalId
const order = {
    customerId: 'c-1',
    customFields: {},
    lines: ['v1', 'v2', 'v3', 'v4', 'v1'].map(id => ({
        productVariantId: id,
        quantity: id === 'v1' ? 2 : 1,
    })),
} as unknown as Order;

async function priceLines(preload: boolean): Promise<(number | null)[]> {
    const memo = new LookupMemo();
    if (preload) await service.preload(ctx, order, memo);
    const result: (number | null)[] = [];
    for (const line of order.lines) {
        const { customerPrice } = await service.resolve(
            ctx,
            String(line.productVariantId),
            { order, quantity: line.quantity },
            { memo },
        );
        result.push(customerPrice);
    }
    return result;
}

describe('order lookup preload (equivalence)', () => {
    it('prices every line exactly as the per-line lookups do', async () => {
        const lazy = await priceLines(false);
        const preloaded = await priceLines(true);
        expect(preloaded).toEqual(lazy);
        expect(preloaded).toEqual([900, 250, 700, 300, 900]);
    });

    it('loads the branch default type once for the variants without a customer price', async () => {
        priceEntry.getForVariants.mockClear();
        await service.preload(ctx, order, new LookupMemo());
        expect(priceEntry.getForVariants).toHaveBeenCalledTimes(2);
        expect(priceEntry.getForVariants).toHaveBeenLastCalledWith(ctx, ['v3'], 'RETAIL');
    });

    it('resolves the default price type id once for the whole order', async () => {
        const twoFallbackLines = {
            ...order,
            lines: [
                { productVariantId: 'v3', quantity: 1 },
                { productVariantId: 'v3', quantity: 1 },
            ],
        } as unknown as Order;
        priceEntry.getPriceTypeCodeById.mockClear();
        const memo = new LookupMemo();
        await service.preload(ctx, twoFallbackLines, memo);
        for (const line of twoFallbackLines.lines) {
            await service.resolve(
                ctx,
                String(line.productVariantId),
                { order: twoFallbackLines, quantity: 1 },
                { memo },
            );
        }
        expect(priceEntry.getPriceTypeCodeById).toHaveBeenCalledTimes(1);
    });
});
