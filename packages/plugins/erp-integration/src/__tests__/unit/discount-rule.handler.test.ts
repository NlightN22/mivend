import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { DiscountRuleStreamHandler } from '../../handlers/discount-rule.handler';

const ctx = {} as RequestContext;

function basePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        entityId: 'dr-1',
        recipientType: 'counterparty',
        recipientId: 'cp-erp-1',
        productId: 'prod-1',
        condition: 'byQuantity',
        conditionValue: 10,
        percent: 15,
        limitAmount: 5000,
        version: '5',
        effectiveFrom: '2026-07-01T00:00:00Z',
        effectiveTo: '2026-07-31T00:00:00Z',
        isActive: true,
        isDeleted: false,
        ...overrides,
    };
}

describe('DiscountRuleStreamHandler', () => {
    it('skips an inactive/deleted rule without writing', async () => {
        const counterpartyDiscountRuleService = { upsertCounterpartyRule: vi.fn() };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);

        await handler.apply(ctx, 'dr-1', basePayload({ isActive: false }));

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).not.toHaveBeenCalled();
    });

    // Integration Service encodes isActive as a plain (non-optional) proto3 bool — absent means
    // false, never true (see types.ts's InboundStream comment, mivend#89).
    it('skips when isActive is absent from the payload', async () => {
        const counterpartyDiscountRuleService = { upsertCounterpartyRule: vi.fn() };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);
        const { isActive, ...payload } = basePayload();
        void isActive;

        await handler.apply(ctx, 'dr-1', payload);

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).not.toHaveBeenCalled();
    });

    it('skips an unrecognized recipientType rather than storing a raw/opaque value', async () => {
        const counterpartyDiscountRuleService = { upsertCounterpartyRule: vi.fn() };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);

        await handler.apply(ctx, 'dr-1', basePayload({ recipientType: 'branch' }));

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).not.toHaveBeenCalled();
    });

    it('skips an unrecognized condition rather than storing a raw/opaque value (closed 2-value set)', async () => {
        const counterpartyDiscountRuleService = { upsertCounterpartyRule: vi.fn() };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);

        await handler.apply(ctx, 'dr-1', basePayload({ condition: 'byWeight' }));

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).not.toHaveBeenCalled();
    });

    it('skips when recipientId/version/conditionValue/percent/effective window is missing', async () => {
        const counterpartyDiscountRuleService = { upsertCounterpartyRule: vi.fn() };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);

        await handler.apply(ctx, 'dr-1', basePayload({ recipientId: '' }));

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).not.toHaveBeenCalled();
    });

    it('upserts a counterparty-scoped, product-specific rule with all fields mapped', async () => {
        const counterpartyDiscountRuleService = {
            upsertCounterpartyRule: vi.fn().mockResolvedValue({}),
        };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);

        await handler.apply(ctx, 'dr-1', basePayload());

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).toHaveBeenCalledWith(ctx, {
            erpId: 'dr-1',
            recipientType: 'counterparty',
            recipientErpId: 'cp-erp-1',
            productErpId: 'prod-1',
            condition: 'byQuantity',
            conditionValue: 10,
            percent: 15,
            limitAmount: 5000,
            validFrom: new Date('2026-07-01T00:00:00Z'),
            validTo: new Date('2026-07-31T00:00:00Z'),
            sourceVersion: '5',
        });
    });

    it('maps a null productId to "applies to all products for this recipient"', async () => {
        const counterpartyDiscountRuleService = {
            upsertCounterpartyRule: vi.fn().mockResolvedValue({}),
        };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);
        const { productId, ...payload } = basePayload();
        void productId;

        await handler.apply(ctx, 'dr-1', payload);

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ productErpId: null }),
        );
    });

    it('maps an absent limitAmount to null (real optional field)', async () => {
        const counterpartyDiscountRuleService = {
            upsertCounterpartyRule: vi.fn().mockResolvedValue({}),
        };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);
        const { limitAmount, ...payload } = basePayload();
        void limitAmount;

        await handler.apply(ctx, 'dr-1', payload);

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ limitAmount: null }),
        );
    });

    it('supports the "contract" recipientType', async () => {
        const counterpartyDiscountRuleService = {
            upsertCounterpartyRule: vi.fn().mockResolvedValue({}),
        };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);

        await handler.apply(
            ctx,
            'dr-1',
            basePayload({ recipientType: 'contract', recipientId: 'contract-erp-1' }),
        );

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                recipientType: 'contract',
                recipientErpId: 'contract-erp-1',
            }),
        );
    });

    it('supports the "byDocumentAmount" condition', async () => {
        const counterpartyDiscountRuleService = {
            upsertCounterpartyRule: vi.fn().mockResolvedValue({}),
        };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);

        await handler.apply(ctx, 'dr-1', basePayload({ condition: 'byDocumentAmount' }));

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ condition: 'byDocumentAmount' }),
        );
    });
});
