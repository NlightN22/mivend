import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CategoryStreamHandler } from '../../handlers/category.handler';

function createServices(existingCollection: { id: string } | undefined) {
    const facetService = {
        findByCode: vi.fn().mockResolvedValue({ id: 'facet-1' }),
        create: vi.fn(),
    };
    const facetValueService = {
        findByFacetId: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'fv-1' }),
        update: vi.fn().mockResolvedValue({ id: 'fv-1' }),
    };
    const collectionService = {
        findOneBySlug: vi.fn().mockResolvedValue(existingCollection),
        create: vi.fn(),
        update: vi.fn(),
    };
    return { facetService, facetValueService, collectionService };
}

describe('CategoryStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when name is missing', async () => {
        const { facetService, facetValueService, collectionService } = createServices(undefined);
        const handler = new CategoryStreamHandler(
            facetService as never,
            facetValueService as never,
            collectionService as never,
        );

        await handler.apply(ctx, 'cat-1', {});

        expect(collectionService.create).not.toHaveBeenCalled();
        expect(collectionService.update).not.toHaveBeenCalled();
    });

    it('creates a visible Collection for an active category', async () => {
        const { facetService, facetValueService, collectionService } = createServices(undefined);
        const handler = new CategoryStreamHandler(
            facetService as never,
            facetValueService as never,
            collectionService as never,
        );

        await handler.apply(ctx, 'cat-1', { name: 'Beverages', isActive: true });

        expect(collectionService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ isPrivate: false }),
        );
    });

    // Integration Service encodes isActive as a plain (non-optional) proto3 bool — proto3 JSON
    // encoding omits a scalar field equal to its zero-value, so `isActive:false` is NEVER sent
    // explicitly, only as an absent key (see types.ts's InboundStream comment, mivend#89's
    // follow-up). A category arriving already-deactivated must never be created publicly visible
    // even briefly.
    it('creates an already-deactivated category as hidden (isActive absent from payload)', async () => {
        const { facetService, facetValueService, collectionService } = createServices(undefined);
        const handler = new CategoryStreamHandler(
            facetService as never,
            facetValueService as never,
            collectionService as never,
        );

        await handler.apply(ctx, 'cat-1', { name: 'Discontinued' });

        expect(collectionService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ isPrivate: true }),
        );
    });

    it('hides an existing visible Collection when the category is later deactivated', async () => {
        const { facetService, facetValueService, collectionService } = createServices({
            id: 'col-1',
        });
        const handler = new CategoryStreamHandler(
            facetService as never,
            facetValueService as never,
            collectionService as never,
        );

        await handler.apply(ctx, 'cat-1', { name: 'Beverages', isActive: false });

        expect(collectionService.update).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ id: 'col-1', isPrivate: true }),
        );
    });

    it('reveals an existing hidden Collection when the category is reactivated', async () => {
        const { facetService, facetValueService, collectionService } = createServices({
            id: 'col-1',
        });
        const handler = new CategoryStreamHandler(
            facetService as never,
            facetValueService as never,
            collectionService as never,
        );

        await handler.apply(ctx, 'cat-1', { name: 'Beverages', isActive: true });

        expect(collectionService.update).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ id: 'col-1', isPrivate: false }),
        );
    });

    it('hides the Collection when isDeleted is explicitly true even if isActive is true', async () => {
        const { facetService, facetValueService, collectionService } = createServices({
            id: 'col-1',
        });
        const handler = new CategoryStreamHandler(
            facetService as never,
            facetValueService as never,
            collectionService as never,
        );

        await handler.apply(ctx, 'cat-1', {
            name: 'Beverages',
            isActive: true,
            isDeleted: true,
        });

        expect(collectionService.update).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ id: 'col-1', isPrivate: true }),
        );
    });
});
