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

describe('GrantedDiscountService tombstones', () => {
    it('soft-deletes at an equal version and keeps it removed against a same-version upsert', async () => {
        const row = { erpId: 'gd-1', sourceVersion: '2', isDeleted: false };
        const { repo, service } = setup(row);
        await service.remove(ctx, 'gd-1', '2');
        expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isDeleted: true }));

        repo.save.mockClear();
        await service.upsert(ctx, { ...input, sourceVersion: '2' });
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('revives a deleted row only on a strictly newer version', async () => {
        const { repo, service } = setup({ erpId: 'gd-1', sourceVersion: '2', isDeleted: true });
        await service.upsert(ctx, { ...input, sourceVersion: '3' });
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({ isDeleted: false, sourceVersion: '3' }),
        );
    });

    it('ignores a tombstone older than the stored version', async () => {
        const { repo, service } = setup({ sourceVersion: '5', isDeleted: false });
        await service.remove(ctx, 'gd-1', '4');
        expect(repo.save).not.toHaveBeenCalled();
    });
});
