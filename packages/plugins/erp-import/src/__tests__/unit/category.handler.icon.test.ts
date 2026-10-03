import { describe, it, expect, vi } from 'vitest';
import { Asset, type RequestContext } from '@vendure/core';

import { CategoryHandler } from '../../handlers/category.handler';
import type { CategoryRecord } from '../../types';

const ctx = {} as RequestContext;

function build(existing: { featuredAsset?: unknown } | null) {
    const collectionService = {
        findOneBySlug: vi.fn(async () => (existing ? { id: 'c1', ...existing } : null)),
        update: vi.fn(),
    };
    const asset = Object.assign(new Asset(), { id: 'a1' });
    const assetService = { createFromFileStream: vi.fn(async () => asset) };
    const getStreamFromPath = vi.fn(async () => ({}));
    const configService = { importExportOptions: { assetImportStrategy: { getStreamFromPath } } };
    const Ctor = CategoryHandler as unknown as new (...args: unknown[]) => CategoryHandler;
    const handler = new Ctor({}, {}, {}, collectionService, assetService, configService);
    return { handler, collectionService, assetService, getStreamFromPath };
}

const record = (iconFile: string): CategoryRecord => ({
    erpId: 'cat-a',
    name: 'A',
    parentErpId: null,
    iconFile,
});
const ensureIcon = (h: CategoryHandler, r: CategoryRecord): Promise<void> =>
    (
        h as unknown as { ensureIcon(c: RequestContext, r: CategoryRecord): Promise<void> }
    ).ensureIcon(ctx, r);

describe('CategoryHandler icon import', () => {
    it('creates the asset and sets it as the featured asset', async () => {
        const { handler, collectionService, getStreamFromPath } = build({});
        await ensureIcon(handler, record('a.svg'));
        expect(getStreamFromPath).toHaveBeenCalledWith('a.svg');
        expect(collectionService.update).toHaveBeenCalledWith(ctx, {
            id: 'c1',
            featuredAssetId: 'a1',
            assetIds: ['a1'],
        });
    });

    it('is idempotent when the collection already has a featured asset', async () => {
        const { handler, assetService } = build({ featuredAsset: { id: 'x' } });
        await ensureIcon(handler, record('a.svg'));
        expect(assetService.createFromFileStream).not.toHaveBeenCalled();
    });

    it('rejects a path that escapes the assets directory', async () => {
        const { handler, getStreamFromPath } = build({});
        await expect(ensureIcon(handler, record('../secret.svg'))).rejects.toThrow(
            /plain file name/,
        );
        expect(getStreamFromPath).not.toHaveBeenCalled();
    });
});
