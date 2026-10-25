import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { NonRetryableInboundError } from '../../non-retryable-inbound-error';
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
    it('skips an inactive (not deleted) rule without writing', async () => {
        const counterpartyDiscountRuleService = {
            upsertCounterpartyRule: vi.fn(),
            deactivateTombstone: vi.fn(),
        };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);

        await handler.apply(ctx, 'dr-1', basePayload({ isActive: false }));

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).not.toHaveBeenCalled();
        expect(counterpartyDiscountRuleService.deactivateTombstone).not.toHaveBeenCalled();
    });

    // search-platform#145: a genuine cancellation now arrives as is_deleted=true for the same
    // entityId — must deactivate the existing rule, not silently no-op.
    it('deactivates the existing rule as a tombstone when isDeleted=true, regardless of other fields', async () => {
        const counterpartyDiscountRuleService = {
            upsertCounterpartyRule: vi.fn(),
            deactivateTombstone: vi.fn().mockResolvedValue(undefined),
        };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);

        await handler.apply(ctx, 'dr-1', basePayload({ isDeleted: true, isActive: true }));

        expect(counterpartyDiscountRuleService.deactivateTombstone).toHaveBeenCalledWith(
            ctx,
            'dr-1',
            '5',
        );
        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).not.toHaveBeenCalled();
    });

    it('treats isDeleted=true as a tombstone even when other fields are missing/malformed', async () => {
        const counterpartyDiscountRuleService = {
            upsertCounterpartyRule: vi.fn(),
            deactivateTombstone: vi.fn().mockResolvedValue(undefined),
        };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);

        await handler.apply(ctx, 'dr-1', { entityId: 'dr-1', isDeleted: true });

        expect(counterpartyDiscountRuleService.deactivateTombstone).toHaveBeenCalledWith(
            ctx,
            'dr-1',
            '',
        );
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

        await expect(
            handler.apply(ctx, 'dr-1', basePayload({ recipientType: 'branch' })),
        ).rejects.toBeInstanceOf(NonRetryableInboundError);

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).not.toHaveBeenCalled();
    });

    it('skips an unrecognized condition rather than storing a raw/opaque value (closed 2-value set)', async () => {
        const counterpartyDiscountRuleService = { upsertCounterpartyRule: vi.fn() };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);

        await expect(
            handler.apply(ctx, 'dr-1', basePayload({ condition: 'byWeight' })),
        ).rejects.toBeInstanceOf(NonRetryableInboundError);

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).not.toHaveBeenCalled();
    });

    it('fails visibly when recipientId is missing', async () => {
        const counterpartyDiscountRuleService = { upsertCounterpartyRule: vi.fn() };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);

        await expect(
            handler.apply(ctx, 'dr-1', basePayload({ recipientId: '' })),
        ).rejects.toBeInstanceOf(NonRetryableInboundError);

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).not.toHaveBeenCalled();
    });

    // effective_to is a real proto3 `optional Timestamp` — absence means no expiry, never
    // required (unlike promo-rule.handler.ts's own non-optional effective_to).
    it('maps an absent effectiveTo to validTo: null (no expiry) rather than skipping', async () => {
        const counterpartyDiscountRuleService = {
            upsertCounterpartyRule: vi.fn().mockResolvedValue({}),
        };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);
        const { effectiveTo, ...payload } = basePayload();
        void effectiveTo;

        await handler.apply(ctx, 'dr-1', payload);

        expect(counterpartyDiscountRuleService.upsertCounterpartyRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ validTo: null }),
        );
    });

    it('skips when effectiveTo is present but unparseable (malformed, not "no expiry")', async () => {
        const counterpartyDiscountRuleService = { upsertCounterpartyRule: vi.fn() };
        const handler = new DiscountRuleStreamHandler(counterpartyDiscountRuleService as never);

        await expect(
            handler.apply(ctx, 'dr-1', basePayload({ effectiveTo: 'not-a-date' })),
        ).rejects.toBeInstanceOf(NonRetryableInboundError);

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

    it('treats an absent conditionValue as zero (proto3 zero scalar omitted)', async () => {
        const service = { upsertCounterpartyRule: vi.fn().mockResolvedValue({}) };
        const handler = new DiscountRuleStreamHandler(service as never);
        const { conditionValue, ...payload } = basePayload();
        void conditionValue;

        const outcome = await handler.apply(ctx, 'dr-1', payload);

        expect(outcome.kind).toBe('applied');
        expect(service.upsertCounterpartyRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ conditionValue: 0 }),
        );
    });

    it('treats an empty productId and empty effectiveTo as whole assortment and open-ended', async () => {
        const service = { upsertCounterpartyRule: vi.fn().mockResolvedValue({}) };
        const handler = new DiscountRuleStreamHandler(service as never);

        await handler.apply(ctx, 'dr-1', basePayload({ productId: '', effectiveTo: '' }));

        expect(service.upsertCounterpartyRule).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ productErpId: null, validTo: null }),
        );
    });

    it('accepts a real production-shaped payload without conditionValue and limitAmount', async () => {
        const service = { upsertCounterpartyRule: vi.fn().mockResolvedValue({}) };
        const handler = new DiscountRuleStreamHandler(service as never);

        const outcome = await handler.apply(ctx, 'p|r|byQuantity|0', {
            percent: 5,
            version: '7',
            isActive: true,
            condition: 'byQuantity',
            productId: 'p',
            recipientId: 'r',
            recipientType: 'counterparty',
            effectiveFrom: '2026-01-01T00:00:00Z',
        });

        expect(outcome.kind).toBe('applied');
    });
});
