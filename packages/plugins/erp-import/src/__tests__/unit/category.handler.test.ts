import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CategoryHandler } from '../../handlers/category.handler';

type Existing = { id: string; isPrivate?: boolean };

function build(
    collections: Record<string, Existing> = {},
    breadcrumbs: Array<{ id: string }> = [{ id: 'root' }, { id: 'col-1' }],
) {
    const facetService = {
        findByCode: vi.fn().mockResolvedValue({ id: 'facet-1' }),
        create: vi.fn(),
    };
    const facetValueService = {
        findByFacetId: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'fv-1' }),
        update: vi.fn(),
    };
    const collectionService = {
        findOneBySlug: vi.fn(async (_ctx: unknown, slug: string) => collections[slug]),
        create: vi.fn().mockResolvedValue({ id: 'placeholder-id' }),
        update: vi.fn(),
        move: vi.fn(),
        getBreadcrumbs: vi.fn().mockResolvedValue(breadcrumbs),
    };
    const handler = new CategoryHandler(
        {} as never,
        facetService as never,
        facetValueService as never,
        collectionService as never,
        {} as never,
        {} as never,
    );
    return { handler, collectionService };
}

const ctx = {} as RequestContext;

describe('CategoryHandler (REST) hierarchy parity with the Kafka path', () => {
    it('places a category under its synced parent', async () => {
        const { handler, collectionService } = build({ 'cat-p': { id: 'col-p' } });
        await handler.upsert(ctx, { erpId: 'c', name: 'C', parentErpId: 'p' });
        expect(collectionService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ parentId: 'col-p', customFields: { feedHidden: false } }),
        );
    });

    it('parks a child that arrives before its parent under a private placeholder', async () => {
        const { handler, collectionService } = build();
        await handler.upsert(ctx, { erpId: 'c', name: 'C', parentErpId: 'p' });
        expect(collectionService.create).toHaveBeenNthCalledWith(
            1,
            ctx,
            expect.objectContaining({ isPrivate: true, customFields: { feedHidden: true } }),
        );
        expect(collectionService.create).toHaveBeenNthCalledWith(
            2,
            ctx,
            expect.objectContaining({ parentId: 'placeholder-id' }),
        );
    });

    it('moves an existing category when its parent changed', async () => {
        const { handler, collectionService } = build(
            { 'cat-c': { id: 'col-1' }, 'cat-p2': { id: 'col-p2' } },
            [{ id: 'root' }, { id: 'col-p1' }, { id: 'col-1' }],
        );
        await handler.upsert(ctx, { erpId: 'c', name: 'C', parentErpId: 'p2' });
        expect(collectionService.move).toHaveBeenCalledWith(ctx, {
            collectionId: 'col-1',
            parentId: 'col-p2',
            index: 0,
        });
    });

    it('does not move when the parent is unchanged', async () => {
        const { handler, collectionService } = build(
            { 'cat-c': { id: 'col-1' }, 'cat-p': { id: 'col-p' } },
            [{ id: 'root' }, { id: 'col-p' }, { id: 'col-1' }],
        );
        await handler.upsert(ctx, { erpId: 'c', name: 'C', parentErpId: 'p' });
        expect(collectionService.move).not.toHaveBeenCalled();
    });

    it('ignores a self-referencing parent', async () => {
        const { handler, collectionService } = build();
        await handler.upsert(ctx, { erpId: 'c', name: 'C', parentErpId: 'c' });
        expect(collectionService.create).toHaveBeenCalledTimes(1);
        expect(collectionService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ parentId: undefined }),
        );
    });
});
