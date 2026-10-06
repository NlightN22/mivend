import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../product-photo-download', async importOriginal => ({
    ...(await importOriginal<typeof import('../../product-photo-download')>()),
    downloadVerifiedPhoto: vi.fn(),
}));

import type { ProductPhoto } from '../../entities/product-photo.entity';
import { downloadVerifiedPhoto, PermanentPhotoError } from '../../product-photo-download';
import { ProductPhotoSyncService } from '../../product-photo-sync.service';
import { MissingDependencyError } from '../../types';

const ctx = {} as RequestContext;
const future = new Date(Date.now() + 3600_000);

function photo(over: Partial<ProductPhoto>): ProductPhoto {
    return {
        id: over.externalId ?? 'f',
        externalId: 'f',
        productExternalId: 'p-1',
        contentHash: 'h',
        mimeType: 'image/jpeg',
        position: 0,
        downloadUrl: 'https://files.example/x',
        downloadUrlExpiresAt: future,
        isDeleted: false,
        status: 'pending',
        assetId: null,
        lastError: null,
        ...over,
    } as ProductPhoto;
}

function setup(rows: ProductPhoto[], productExists = true) {
    const store = rows.map(r => ({ ...r }));
    const repo = {
        find: vi.fn(async () => store.map(r => ({ ...r }))),
        findOne: vi.fn(
            async (q: { where: { contentHash: string } }) =>
                store.find(r => r.assetId && r.contentHash === q.where.contentHash) ?? null,
        ),
        update: vi.fn(async (id: string, patch: Partial<ProductPhoto>) => {
            Object.assign(store.find(r => r.id === id) as ProductPhoto, patch);
        }),
        remove: vi.fn(),
    };
    const qb = {
        select: vi.fn(),
        from: vi.fn(),
        where: vi.fn(),
        getRawOne: vi.fn().mockResolvedValue(productExists ? { id: '7' } : undefined),
    };
    qb.select.mockReturnValue(qb);
    qb.from.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
    let assetSeq = 100;
    const assetService = {
        createFromFileStream: vi.fn(async () => ({ id: ++assetSeq })),
    };
    const productService = { update: vi.fn() };
    const service = new ProductPhotoSyncService(
        {} as never,
        {} as never,
        { getRepository: () => repo, rawConnection: { createQueryBuilder: () => qb } } as never,
        assetService as never,
        productService as never,
    );
    return { service, repo, assetService, productService };
}

describe('ProductPhotoSyncService.syncProduct', () => {
    it('attaches downloaded photos in position order with position 0 featured', async () => {
        vi.mocked(downloadVerifiedPhoto).mockResolvedValue(Buffer.from('x'));
        const { service, productService } = setup([
            photo({ id: 'b', externalId: 'b', contentHash: 'hb', position: 1 }),
            photo({ id: 'a', externalId: 'a', contentHash: 'ha', position: 0 }),
        ]);
        await service.syncProduct(ctx, 'p-1');
        const call = productService.update.mock.calls[0][1];
        // 'b' is listed (and downloaded) first, but position 0 ('a', asset 102) must lead.
        expect(call.assetIds).toEqual(['102', '101']);
        expect(call.featuredAssetId).toBe('102');
        expect(call.assetIds).toHaveLength(2);
    });

    it('stores one binary once for two photos sharing a hash', async () => {
        vi.mocked(downloadVerifiedPhoto).mockResolvedValue(Buffer.from('x'));
        const { service, assetService, productService } = setup([
            photo({ id: 'a', externalId: 'a', contentHash: 'same', position: 0 }),
            photo({ id: 'b', externalId: 'b', contentHash: 'same', position: 1 }),
        ]);
        await service.syncProduct(ctx, 'p-1');
        expect(assetService.createFromFileStream).toHaveBeenCalledTimes(1);
        expect(productService.update.mock.calls[0][1].assetIds).toHaveLength(1);
    });

    it('marks an expired link failed without downloading and still attaches the rest', async () => {
        vi.mocked(downloadVerifiedPhoto).mockClear();
        const { service, repo } = setup([
            photo({ id: 'a', externalId: 'a', downloadUrlExpiresAt: new Date(Date.now() - 1000) }),
        ]);
        await service.syncProduct(ctx, 'p-1');
        expect(downloadVerifiedPhoto).not.toHaveBeenCalled();
        expect(repo.update).toHaveBeenCalledWith(
            'a',
            expect.objectContaining({ status: 'failed' }),
        );
    });

    it('fails permanently on a hash mismatch', async () => {
        vi.mocked(downloadVerifiedPhoto).mockRejectedValue(new PermanentPhotoError('mismatch'));
        const { service, repo } = setup([photo({ id: 'a', externalId: 'a' })]);
        await service.syncProduct(ctx, 'p-1');
        expect(repo.update).toHaveBeenCalledWith(
            'a',
            expect.objectContaining({ status: 'failed', lastError: 'mismatch' }),
        );
    });

    it('rethrows a transient error after attaching what succeeded, so the job retries', async () => {
        vi.mocked(downloadVerifiedPhoto)
            .mockResolvedValueOnce(Buffer.from('x'))
            .mockRejectedValueOnce(new Error('HTTP 503'));
        const { service, productService } = setup([
            photo({ id: 'a', externalId: 'a', contentHash: 'ha', position: 0 }),
            photo({ id: 'b', externalId: 'b', contentHash: 'hb', position: 1 }),
        ]);
        await expect(service.syncProduct(ctx, 'p-1')).rejects.toThrow('HTTP 503');
        expect(productService.update.mock.calls[0][1].assetIds).toHaveLength(1);
    });

    it('detaches a tombstoned photo and removes its row', async () => {
        const { service, repo, productService } = setup([
            photo({ id: 'a', externalId: 'a', status: 'downloaded', assetId: '5' }),
            photo({
                id: 'b',
                externalId: 'b',
                isDeleted: true,
                status: 'downloaded',
                assetId: '6',
            }),
        ]);
        await service.syncProduct(ctx, 'p-1');
        expect(productService.update.mock.calls[0][1].assetIds).toEqual(['5']);
        expect(repo.remove).toHaveBeenCalledWith([expect.objectContaining({ id: 'b' })]);
    });

    it('throws a retryable error when the product is not imported yet', async () => {
        const { service } = setup([photo({})], false);
        await expect(service.syncProduct(ctx, 'p-1')).rejects.toBeInstanceOf(
            MissingDependencyError,
        );
    });
});
