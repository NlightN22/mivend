import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CategoryStreamHandler } from '../../handlers/category.handler';

interface Setup {
    collections?: Record<string, { id: string; name?: string }>;
    facetValues?: Array<{ id: string; code: string }>;
    descendants?: Array<{ slug: string }>;
    breadcrumbs?: Array<{ id: string }>;
}

function build({ collections = {}, facetValues = [], descendants = [], breadcrumbs }: Setup) {
    const facetService = {
        findByCode: vi.fn().mockResolvedValue({ id: 'facet-1' }),
        create: vi.fn(),
    };
    const facetValueService = {
        findByFacetId: vi.fn().mockResolvedValue(facetValues),
        create: vi.fn().mockResolvedValue({ id: 'fv-new' }),
        update: vi.fn(async (_ctx: unknown, input: { id: string }) => ({ id: input.id })),
    };
    const collectionService = {
        findOneBySlug: vi.fn(async (_ctx: unknown, slug: string) => collections[slug]),
        create: vi.fn().mockResolvedValue({ id: 'placeholder-id' }),
        update: vi.fn(),
        move: vi.fn(),
        getDescendants: vi.fn().mockResolvedValue(descendants),
        getBreadcrumbs: vi.fn().mockResolvedValue(breadcrumbs ?? [{ id: 'root' }, { id: 'col-1' }]),
    };
    const handler = new CategoryStreamHandler(
        facetService as never,
        facetValueService as never,
        collectionService as never,
    );
    return { handler, collectionService };
}

const ctx = {} as RequestContext;
const active = { name: 'Child', isActive: true };

describe('CategoryStreamHandler hierarchy', () => {
    it('creates a top-level category without a parentId when parent_id is absent', async () => {
        const { handler, collectionService } = build({});
        await handler.apply(ctx, 'c1', active);
        expect(collectionService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ parentId: undefined }),
        );
    });

    it('places a new category under its already-synced parent', async () => {
        const { handler, collectionService } = build({
            collections: { 'cat-p1': { id: 'col-p1' } },
        });
        await handler.apply(ctx, 'c1', { ...active, parentId: 'p1' });
        expect(collectionService.create).toHaveBeenCalledTimes(1);
        expect(collectionService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ parentId: 'col-p1' }),
        );
    });

    it('creates a private placeholder parent instead of failing or flattening under root', async () => {
        const { handler, collectionService } = build({});
        await handler.apply(ctx, 'c1', { ...active, parentId: 'p1' });
        expect(collectionService.create).toHaveBeenNthCalledWith(
            1,
            ctx,
            expect.objectContaining({
                isPrivate: true,
                filters: [],
                translations: [expect.objectContaining({ slug: 'cat-p1', name: 'p1' })],
            }),
        );
        expect(collectionService.create).toHaveBeenNthCalledWith(
            2,
            ctx,
            expect.objectContaining({ parentId: 'placeholder-id' }),
        );
    });

    it('fills an existing placeholder from the parent real event without creating a duplicate', async () => {
        const { handler, collectionService } = build({
            collections: { 'cat-p1': { id: 'col-p1', name: 'p1' } },
            breadcrumbs: [{ id: 'root' }, { id: 'col-p1' }],
        });
        await handler.apply(ctx, 'p1', { name: 'Real Parent', isActive: true });
        expect(collectionService.create).not.toHaveBeenCalled();
        expect(collectionService.update).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                id: 'col-p1',
                isPrivate: false,
                translations: [expect.objectContaining({ name: 'Real Parent' })],
            }),
        );
    });

    it('moves an existing category when its parent changed', async () => {
        const { handler, collectionService } = build({
            collections: { 'cat-c1': { id: 'col-1' }, 'cat-p2': { id: 'col-p2' } },
            breadcrumbs: [{ id: 'root' }, { id: 'col-p1' }, { id: 'col-1' }],
        });
        await handler.apply(ctx, 'c1', { ...active, parentId: 'p2' });
        expect(collectionService.move).toHaveBeenCalledWith(ctx, {
            collectionId: 'col-1',
            parentId: 'col-p2',
            index: 0,
        });
    });

    it('does not move when the parent is unchanged (redelivery is idempotent)', async () => {
        const { handler, collectionService } = build({
            collections: { 'cat-c1': { id: 'col-1' }, 'cat-p1': { id: 'col-p1' } },
            breadcrumbs: [{ id: 'root' }, { id: 'col-p1' }, { id: 'col-1' }],
        });
        await handler.apply(ctx, 'c1', { ...active, parentId: 'p1' });
        expect(collectionService.move).not.toHaveBeenCalled();
    });

    it('moves to the root when parent_id is dropped', async () => {
        const { handler, collectionService } = build({
            collections: { 'cat-c1': { id: 'col-1' } },
            breadcrumbs: [{ id: 'root' }, { id: 'col-p1' }, { id: 'col-1' }],
        });
        await handler.apply(ctx, 'c1', active);
        expect(collectionService.move).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ collectionId: 'col-1', parentId: 'root' }),
        );
    });

    it('a nameless tombstone keeps the existing hierarchy', async () => {
        const { handler, collectionService } = build({
            collections: { 'cat-c1': { id: 'col-1', name: 'Child' } },
            facetValues: [{ id: 'fv-1', code: 'c1' }],
            breadcrumbs: [{ id: 'root' }, { id: 'col-p1' }, { id: 'col-1' }],
        });
        await handler.apply(ctx, 'c1', { isDeleted: true });
        expect(collectionService.move).not.toHaveBeenCalled();
    });

    it('ignores a self-referencing parent_id instead of looping', async () => {
        const { handler, collectionService } = build({});
        await handler.apply(ctx, 'c1', { ...active, parentId: 'c1' });
        expect(collectionService.create).toHaveBeenCalledTimes(1);
        expect(collectionService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ parentId: undefined }),
        );
    });

    it('widens an existing category filter to its subtree facet values', async () => {
        const { handler, collectionService } = build({
            collections: { 'cat-p1': { id: 'col-p1' } },
            facetValues: [
                { id: 'fv-p1', code: 'p1' },
                { id: 'fv-c1', code: 'c1' },
                { id: 'fv-c2', code: 'c2' },
            ],
            descendants: [{ slug: 'cat-c1' }, { slug: 'cat-c2' }, { slug: 'cat-no-fv-yet' }],
            breadcrumbs: [{ id: 'root' }, { id: 'col-p1' }],
        });
        await handler.apply(ctx, 'p1', { name: 'Parent', isActive: true });
        const filters = collectionService.update.mock.calls[0][1].filters;
        expect(filters[0].arguments).toEqual([
            { name: 'facetValueIds', value: JSON.stringify(['fv-c1', 'fv-c2', 'fv-p1']) },
            { name: 'containsAny', value: 'true' },
        ]);
    });
});
