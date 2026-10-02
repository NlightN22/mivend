import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { GrantedDiscountService } from '../../granted-discount.service';

const ctx = {} as RequestContext;
const input = {
    erpId: 'gd-1',
    sourceDocumentId: 'ship-1',
    counterpartyErpId: 'cp-1',
    productErpId: 'prod-1',
    orderEntityId: null,
    discountDocumentId: null,
    discountRuleRecipientId: 'rule-1',
    condition: null,
    discountAmount: 5,
    sourceVersion: '2',
};

function setup(existing: Record<string, unknown> | null) {
    const repo = { findOne: vi.fn().mockResolvedValue(existing), save: vi.fn() };
    const service = new GrantedDiscountService({ getRepository: () => repo } as never);
    return { repo, service };
}

describe('GrantedDiscountService.upsert', () => {
    it('creates a row when none exists for the erpId', async () => {
        const { repo, service } = setup(null);
        await service.upsert(ctx, input);
        expect(repo.save).toHaveBeenCalledWith(expect.objectContaining(input));
    });

    it('updates the existing row in place instead of inserting a duplicate', async () => {
        const existing = { id: 9, erpId: 'gd-1', discountAmount: 1, sourceVersion: '1' };
        const { repo, service } = setup(existing);
        await service.upsert(ctx, input);
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({ id: 9, discountAmount: 5, sourceVersion: '2' }),
        );
    });
});
