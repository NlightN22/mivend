import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PromoRuleStreamHandler } from '../../handlers/promo-rule.handler';

const ctx = {} as RequestContext;

function basePercentPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        entityId: 'promo-1',
        triggerProductId: 'prod-trigger',
        triggerQuantity: 3,
        percent: 15,
        operationKind: 'ПроцентСкидки',
        effectiveFrom: '2026-07-01T00:00:00Z',
        effectiveTo: '2026-07-31T00:00:00Z',
        isActive: true,
        isDeleted: false,
        ...overrides,
    };
}

function baseGiftPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        entityId: 'promo-2',
        triggerProductId: 'prod-trigger',
        triggerQuantity: 2,
        giftProductId: 'prod-gift',
        giftQuantity: 1,
        percent: 0,
        operationKind: 'ОдинПодарокИзСписка',
        effectiveFrom: '2026-07-01T00:00:00Z',
        effectiveTo: '2026-07-31T00:00:00Z',
        isActive: true,
        isDeleted: false,
        ...overrides,
    };
}

describe('PromoRuleStreamHandler', () => {
    it('skips an inactive/deleted rule without writing', async () => {
        const promoDiscountRuleService = { upsertPromoRule: vi.fn() };
        const handler = new PromoRuleStreamHandler(promoDiscountRuleService as never);

        await handler.apply(ctx, 'promo-1', basePercentPayload({ isActive: false }));

        expect(promoDiscountRuleService.upsertPromoRule).not.toHaveBeenCalled();
    });

    // Integration Service encodes isActive as a plain (non-optional) proto3 bool — absent means
    // false, never true (see types.ts's InboundStream comment, mivend#89).
    it('skips when isActive is absent from the payload', async () => {
        const promoDiscountRuleService = { upsertPromoRule: vi.fn() };
        const handler = new PromoRuleStreamHandler(promoDiscountRuleService as never);
        const { isActive, ...payload } = basePercentPayload();
        void isActive;

        await handler.apply(ctx, 'promo-1', payload);

        expect(promoDiscountRuleService.upsertPromoRule).not.toHaveBeenCalled();
    });

    it('skips an unrecognized operationKind rather than storing a raw/opaque value', async () => {
        const promoDiscountRuleService = { upsertPromoRule: vi.fn() };
        const handler = new PromoRuleStreamHandler(promoDiscountRuleService as never);

        await handler.apply(
            ctx,
            'promo-1',
            basePercentPayload({ operationKind: 'НеизвестныйВид' }),
        );

        expect(promoDiscountRuleService.upsertPromoRule).not.toHaveBeenCalled();
    });

    it('skips when triggerProductId/triggerQuantity/effective window is missing', async () => {
        const promoDiscountRuleService = { upsertPromoRule: vi.fn() };
        const handler = new PromoRuleStreamHandler(promoDiscountRuleService as never);

        await handler.apply(ctx, 'promo-1', basePercentPayload({ triggerProductId: '' }));

        expect(promoDiscountRuleService.upsertPromoRule).not.toHaveBeenCalled();
    });

    it('upserts a percent-type rule against the trigger product, no gift fields', async () => {
        const promoDiscountRuleService = { upsertPromoRule: vi.fn().mockResolvedValue({}) };
        const handler = new PromoRuleStreamHandler(promoDiscountRuleService as never);

        await handler.apply(ctx, 'promo-1', basePercentPayload());

        expect(promoDiscountRuleService.upsertPromoRule).toHaveBeenCalledWith(ctx, {
            erpId: 'promo-1',
            percent: 15,
            validFrom: new Date('2026-07-01T00:00:00Z'),
            validTo: new Date('2026-07-31T00:00:00Z'),
            triggerProductErpId: 'prod-trigger',
            triggerQuantity: 3,
            giftProductErpId: null,
            giftQuantity: null,
            operationKind: 'percent-discount',
        });
    });

    it('maps the flat-20% raw kind to the same percent-discount union value', async () => {
        const promoDiscountRuleService = { upsertPromoRule: vi.fn().mockResolvedValue({}) };
        const handler = new PromoRuleStreamHandler(promoDiscountRuleService as never);

        await handler.apply(ctx, 'promo-1', basePercentPayload({ operationKind: 'Скидка20НаВсе' }));

        expect(promoDiscountRuleService.upsertPromoRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ operationKind: 'percent-discount' }),
        );
    });

    it('upserts a gift-type rule at the near-free GIFT_TYPE_PERCENT, ignoring the payload percent (0)', async () => {
        const promoDiscountRuleService = { upsertPromoRule: vi.fn().mockResolvedValue({}) };
        const handler = new PromoRuleStreamHandler(promoDiscountRuleService as never);

        await handler.apply(ctx, 'promo-2', baseGiftPayload());

        expect(promoDiscountRuleService.upsertPromoRule).toHaveBeenCalledWith(ctx, {
            erpId: 'promo-2',
            percent: 99,
            validFrom: new Date('2026-07-01T00:00:00Z'),
            validTo: new Date('2026-07-31T00:00:00Z'),
            triggerProductErpId: 'prod-trigger',
            triggerQuantity: 2,
            giftProductErpId: 'prod-gift',
            giftQuantity: 1,
            operationKind: 'gift-one-from-list',
        });
    });

    it('maps the "all gifts from list" raw kind to its own union value', async () => {
        const promoDiscountRuleService = { upsertPromoRule: vi.fn().mockResolvedValue({}) };
        const handler = new PromoRuleStreamHandler(promoDiscountRuleService as never);

        await handler.apply(
            ctx,
            'promo-2',
            baseGiftPayload({ operationKind: 'ВсеПодаркиИзСписка' }),
        );

        expect(promoDiscountRuleService.upsertPromoRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ operationKind: 'gift-all-from-list' }),
        );
    });

    it('skips a gift-type rule missing giftProductId/giftQuantity', async () => {
        const promoDiscountRuleService = { upsertPromoRule: vi.fn() };
        const handler = new PromoRuleStreamHandler(promoDiscountRuleService as never);

        await handler.apply(ctx, 'promo-2', baseGiftPayload({ giftProductId: '' }));

        expect(promoDiscountRuleService.upsertPromoRule).not.toHaveBeenCalled();
    });
});
