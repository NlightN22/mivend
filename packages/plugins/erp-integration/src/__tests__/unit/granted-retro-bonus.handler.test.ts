import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { GrantedRetroBonusStreamHandler } from '../../handlers/granted-retro-bonus.handler';

const ctx = {} as RequestContext;

function basePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        version: '3',
        sourceDocumentId: 'doc-1',
        sourceCounterpartyId: 'cp-1',
        recipientCounterpartyId: 'cp-2',
        productId: 'prod-1',
        percent: 0,
        quantity: 0,
        amount: 0,
        ...overrides,
    };
}

function createHandler() {
    const service = { upsert: vi.fn().mockResolvedValue(undefined) };
    return { handler: new GrantedRetroBonusStreamHandler(service as never), service };
}

describe('GrantedRetroBonusStreamHandler', () => {
    it('maps all fields, keeping legitimate zero numbers and recipient distinct from source', async () => {
        const { handler, service } = createHandler();
        await handler.apply(
            ctx,
            'grb-1',
            basePayload({
                discountDocumentId: 'dd-1',
                operationKind: 'Предоставление',
                accrualKind: 'ПоПродажам',
                orderEntityId: 'ord-1',
            }),
        );
        expect(service.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'grb-1',
            sourceDocumentErpId: 'doc-1',
            sourceCounterpartyErpId: 'cp-1',
            recipientCounterpartyErpId: 'cp-2',
            productErpId: 'prod-1',
            discountDocumentErpId: 'dd-1',
            operationKind: 'Предоставление',
            accrualKind: 'ПоПродажам',
            percent: 0,
            quantity: 0,
            amount: 0,
            orderErpId: 'ord-1',
            sourceVersion: '3',
        });
    });

    it('maps absent optionals to null', async () => {
        const { handler, service } = createHandler();
        await handler.apply(ctx, 'grb-1', basePayload());
        expect(service.upsert).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                discountDocumentErpId: null,
                operationKind: null,
                accrualKind: null,
                orderErpId: null,
            }),
        );
    });

    it.each([
        ['version', { version: '' }],
        ['sourceDocumentId', { sourceDocumentId: undefined }],
        ['recipientCounterpartyId', { recipientCounterpartyId: '' }],
        ['productId', { productId: undefined }],
        ['percent', { percent: undefined }],
        ['amount', { amount: 'abc' }],
    ])('skips when %s is missing/invalid', async (_n, overrides) => {
        const { handler, service } = createHandler();
        await handler.apply(ctx, 'grb-1', basePayload(overrides));
        expect(service.upsert).not.toHaveBeenCalled();
    });
});
