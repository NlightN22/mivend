import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { GrantedDiscountStreamHandler } from '../../handlers/granted-discount.handler';

const ctx = {} as RequestContext;

function basePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        entityId: 'gd-1',
        sourceDocumentId: 'ship-1',
        sourceCounterpartyId: 'cp-1',
        productId: 'prod-1',
        discountRuleRecipientId: 'rule-1',
        discountAmount: 12.5,
        version: '7',
        orderEntityId: 'order-1',
        discountDocumentId: 'dd-1',
        condition: 'ПоКоличествуТовара',
        ...overrides,
    };
}

describe('GrantedDiscountStreamHandler', () => {
    it('upserts a full payload, mapping optional fields', async () => {
        const service = { upsert: vi.fn().mockResolvedValue(undefined) };
        await new GrantedDiscountStreamHandler(service as never).apply(ctx, 'gd-1', basePayload());

        expect(service.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'gd-1',
            sourceDocumentId: 'ship-1',
            counterpartyErpId: 'cp-1',
            productErpId: 'prod-1',
            orderEntityId: 'order-1',
            discountDocumentId: 'dd-1',
            discountRuleRecipientId: 'rule-1',
            condition: 'ПоКоличествуТовара',
            discountAmount: 12.5,
            sourceVersion: '7',
        });
    });

    it('stores nulls for absent optional fields without failing', async () => {
        const service = { upsert: vi.fn().mockResolvedValue(undefined) };
        await new GrantedDiscountStreamHandler(service as never).apply(
            ctx,
            'gd-1',
            basePayload({
                orderEntityId: undefined,
                discountDocumentId: undefined,
                condition: undefined,
            }),
        );

        expect(service.upsert).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                orderEntityId: null,
                discountDocumentId: null,
                condition: null,
            }),
        );
    });

    it.each(['sourceDocumentId', 'sourceCounterpartyId', 'productId', 'version'])(
        'skips a malformed payload missing %s',
        async field => {
            const service = { upsert: vi.fn() };
            await new GrantedDiscountStreamHandler(service as never).apply(
                ctx,
                'gd-1',
                basePayload({ [field]: undefined }),
            );
            expect(service.upsert).not.toHaveBeenCalled();
        },
    );

    it('removes the row on a tombstone without validating the emptied fields', async () => {
        const service = { upsert: vi.fn(), remove: vi.fn().mockResolvedValue(undefined) };
        await new GrantedDiscountStreamHandler(service as never).apply(ctx, 'gd-1', {
            version: '9',
            isDeleted: true,
            sourceDocumentId: '',
        });
        expect(service.remove).toHaveBeenCalledWith(ctx, 'gd-1');
        expect(service.upsert).not.toHaveBeenCalled();
    });

    it('upserts again for isDeleted=false at a newer version (line re-posted)', async () => {
        const service = { upsert: vi.fn().mockResolvedValue(undefined), remove: vi.fn() };
        await new GrantedDiscountStreamHandler(service as never).apply(
            ctx,
            'gd-1',
            basePayload({ isDeleted: false, version: '10' }),
        );
        expect(service.upsert).toHaveBeenCalledOnce();
        expect(service.remove).not.toHaveBeenCalled();
    });
});
