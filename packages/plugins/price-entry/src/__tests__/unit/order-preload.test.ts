import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { LookupMemo } from '../../lookup-memo';
import { preloadOrderLookups } from '../../order-preload';
import { PriceEntryService } from '../../price-entry.service';

const ctx = { languageCode: 'en' } as unknown as RequestContext;

function setup() {
    const variants = [
        {
            id: 'v-a',
            facetValues: [],
            customFields: { weight: 2 },
            product: { customFields: { externalId: 'erp-a' }, facetValues: [] },
        },
        {
            id: 'v-b',
            facetValues: [],
            customFields: {},
            product: { customFields: {}, facetValues: [] },
        },
    ];
    const rules = [{ triggerProductErpId: 'erp-a', giftProductErpId: null }];
    const qb = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getMany: vi.fn(async () => rules),
    };
    const variantFind = vi.fn(async () => variants);
    const connection = {
        getRepository: vi.fn((_c: unknown, entity: { name: string }) =>
            entity.name === 'ProductVariant'
                ? { find: variantFind }
                : { createQueryBuilder: () => qb },
        ),
    } as unknown as TransactionalConnection;
    const priceEntry = {
        getPriceTypeCodeForCustomer: vi.fn(async () => 'WHOLESALE'),
        getForVariants: vi.fn(async () => new Map([['v-a', 100]])),
    } as unknown as PriceEntryService;
    const order = {
        customerId: 'c-1',
        lines: [
            { productVariantId: 'v-a' },
            { productVariantId: 'v-b' },
            { productVariantId: 'v-a' },
        ],
    } as unknown as Order;
    return { connection, priceEntry, order, variantFind, qb };
}

describe('preloadOrderLookups', () => {
    it('runs one query per kind for the whole order and seeds the memo', async () => {
        const { connection, priceEntry, order, variantFind, qb } = setup();
        const memo = new LookupMemo();
        await preloadOrderLookups(connection, priceEntry, ctx, order, memo);

        expect(variantFind).toHaveBeenCalledTimes(1);
        expect(qb.getMany).toHaveBeenCalledTimes(1);
        expect(priceEntry.getForVariants).toHaveBeenCalledTimes(1);
        const load = vi.fn();
        expect(await memo.get('erp:v-a', load)).toBe('erp-a');
        expect(await memo.get('erp:v-b', load)).toBe('');
        expect(await memo.get('fw:v-a', load)).toEqual({ facetValues: [], weight: 2 });
        expect(await memo.get('promo:erp-a', load)).toHaveLength(1);
        expect(await memo.get('price:v-a:WHOLESALE', load)).toBe(100);
        expect(await memo.get('price:v-b:WHOLESALE', load)).toBeNull();
        expect(load).not.toHaveBeenCalled();
    });

    it('does nothing for an empty order', async () => {
        const { connection, priceEntry, variantFind } = setup();
        await preloadOrderLookups(
            connection,
            priceEntry,
            ctx,
            { lines: [] } as unknown as Order,
            new LookupMemo(),
        );
        expect(variantFind).not.toHaveBeenCalled();
    });
});
