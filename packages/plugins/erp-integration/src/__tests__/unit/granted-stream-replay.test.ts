import { GrantedDiscountService } from '@mivend/plugin-price-entry';
import { GrantedRetroBonusService } from '@mivend/plugin-retro-bonus';
import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { GrantedDiscountStreamHandler } from '../../handlers/granted-discount.handler';
import { GrantedRetroBonusStreamHandler } from '../../handlers/granted-retro-bonus.handler';
import { streamsOf } from '../guarded-stream-families';

const ctx = {} as RequestContext;

function discountHandler(stored: Record<string, unknown>): {
    handler: GrantedDiscountStreamHandler;
    save: ReturnType<typeof vi.fn>;
} {
    const save = vi.fn();
    const repo = { findOne: vi.fn().mockResolvedValue(stored), save, query: vi.fn() };
    const connection = {
        getRepository: () => repo,
        withTransaction: (c: unknown, work: (c: unknown) => unknown) => work(c),
    };
    return {
        handler: new GrantedDiscountStreamHandler(new GrantedDiscountService(connection as never)),
        save,
    };
}

function retroHandler(stored: Record<string, unknown>): {
    handler: GrantedRetroBonusStreamHandler;
    save: ReturnType<typeof vi.fn>;
} {
    const save = vi.fn();
    const repo = {
        findOne: vi.fn().mockResolvedValue(stored),
        create: vi.fn((v: object) => ({ ...v })),
        save,
    };
    const service = new GrantedRetroBonusService(
        { getRepository: () => repo } as never,
        { build: vi.fn() } as never,
    );
    return { handler: new GrantedRetroBonusStreamHandler(service), save };
}

const discountPayload = (version: string): Record<string, unknown> => ({
    version,
    sourceDocumentId: 'ship-1',
    sourceCounterpartyId: 'cp-1',
    productId: 'prod-1',
    discountRuleRecipientId: 'rule-1',
    discountAmount: 5,
});

const retroPayload = (version: string): Record<string, unknown> => ({
    version,
    sourceDocumentId: 'doc-1',
    sourceCounterpartyId: 'cp-1',
    recipientCounterpartyId: 'cp-2',
    productId: 'prod-1',
    percent: 5,
    quantity: 2,
    amount: 10,
});

describe('granted streams: an older delivery after the inbox floor row is gone', () => {
    it('covers every granted stream in the guarded list', () => {
        expect(streamsOf('granted').sort()).toEqual(['granted-discount', 'granted-retro-bonus']);
    });

    it('granted-discount keeps the stored fact', async () => {
        const { handler, save } = discountHandler({
            erpId: 'gd-1',
            sourceVersion: '5',
            isDeleted: false,
        });
        await handler.apply(ctx, 'gd-1', discountPayload('4'));
        expect(save).not.toHaveBeenCalled();
    });

    it('granted-retro-bonus keeps the stored fact', async () => {
        const { handler, save } = retroHandler({ erpId: 'grb-1', sourceVersion: '5' });
        await handler.apply(ctx, 'grb-1', retroPayload('4'));
        expect(save).not.toHaveBeenCalled();
    });
});
