import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import type { ProductPhoto } from '../../entities/product-photo.entity';
import { ProductPhotoStreamHandler } from '../../handlers/product-photo.handler';
import type { ProductPhotoSyncService } from '../../product-photo-sync.service';
import { MissingDependencyError } from '../../types';

const ctx = {} as RequestContext;

const payload = {
    productId: 'p-1',
    contentHash: 'abc',
    mimeType: 'image/jpeg',
    downloadUrl: 'https://files.example/p.jpg?sig=1',
    downloadUrlExpiresAt: '2026-10-13T00:00:00Z',
};

function setup(opts: { existing?: Partial<ProductPhoto>; productExists?: boolean } = {}) {
    const repo = {
        findOne: vi.fn().mockResolvedValue(opts.existing ?? null),
        save: vi.fn(),
        update: vi.fn(),
        create: vi.fn((v: unknown) => v),
    };
    const getRawOne = vi
        .fn()
        .mockResolvedValue(opts.productExists === false ? undefined : { id: '1' });
    const qb = { select: vi.fn(), from: vi.fn(), where: vi.fn(), getRawOne };
    qb.select.mockReturnValue(qb);
    qb.from.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
    const connection = {
        getRepository: () => repo,
        rawConnection: { createQueryBuilder: () => qb },
    };
    const enqueue = vi.fn();
    const handler = new ProductPhotoStreamHandler(
        connection as never,
        { enqueue } as unknown as ProductPhotoSyncService,
    );
    return { repo, enqueue, handler };
}

describe('ProductPhotoStreamHandler', () => {
    it('stores a new photo as pending and enqueues its product; absent position means 0', async () => {
        const { repo, enqueue, handler } = setup();
        await handler.apply(ctx, 'f-1', payload);
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                externalId: 'f-1',
                productExternalId: 'p-1',
                position: 0,
                status: 'pending',
                assetId: null,
            }),
        );
        expect(enqueue).toHaveBeenCalledWith('p-1');
    });

    it('throws a retryable error when the product has not arrived yet', async () => {
        const { repo, enqueue, handler } = setup({ productExists: false });
        await expect(handler.apply(ctx, 'f-1', payload)).rejects.toBeInstanceOf(
            MissingDependencyError,
        );
        expect(repo.save).not.toHaveBeenCalled();
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('skips an incomplete payload without retry', async () => {
        const { repo, handler } = setup();
        await handler.apply(ctx, 'f-1', { productId: 'p-1' });
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('keeps the downloaded asset when the same binary is replayed with a fresh URL', async () => {
        const { repo, handler } = setup({
            existing: {
                id: 5,
                contentHash: 'abc',
                status: 'downloaded',
                assetId: '9',
                productExternalId: 'p-1',
            },
        });
        await handler.apply(ctx, 'f-1', { ...payload, position: 2 });
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({ id: 5, status: 'downloaded', assetId: '9', position: 2 }),
        );
    });

    it('resets to pending when the binary changed', async () => {
        const { repo, handler } = setup({
            existing: {
                id: 5,
                contentHash: 'old',
                status: 'downloaded',
                assetId: '9',
                productExternalId: 'p-1',
            },
        });
        await handler.apply(ctx, 'f-1', payload);
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'pending', assetId: null }),
        );
    });

    it('marks a known photo deleted on a tombstone and enqueues its product', async () => {
        const { repo, enqueue, handler } = setup({
            existing: { id: 5, productExternalId: 'p-1' },
        });
        await handler.apply(ctx, 'f-1', { isDeleted: true });
        expect(repo.update).toHaveBeenCalledWith(5, { isDeleted: true });
        expect(enqueue).toHaveBeenCalledWith('p-1');
    });

    it('ignores a tombstone for an unknown photo', async () => {
        const { repo, enqueue, handler } = setup();
        await handler.apply(ctx, 'f-1', { isDeleted: true });
        expect(repo.update).not.toHaveBeenCalled();
        expect(enqueue).not.toHaveBeenCalled();
    });
});
