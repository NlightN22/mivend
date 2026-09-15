import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CategoryStreamHandler } from '../../handlers/category.handler';

function createServices(
    existingCollection:
        | { id: string; name?: string; customFields?: { visibilityOverride?: string | null } }
        | undefined,
    existingFacetValues: Array<{ id: string; code: string }> = [],
) {
    const facetService = {
        findByCode: vi.fn().mockResolvedValue({ id: 'facet-1' }),
        create: vi.fn(),
    };
    const facetValueService = {
        findByFacetId: vi.fn().mockResolvedValue(existingFacetValues),
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

    // Issue #90 scope addition: a manual visibilityOverride must survive the next feed recompute.
    it('keeps a Collection hidden via visibilityOverride even when the feed says active', async () => {
        const { facetService, facetValueService, collectionService } = createServices({
            id: 'col-1',
            customFields: { visibilityOverride: 'hidden' },
        });
        const handler = new CategoryStreamHandler(
            facetService as never,
            facetValueService as never,
            collectionService as never,
        );

        await handler.apply(ctx, 'cat-1', { name: 'Beverages', isActive: true });

        expect(collectionService.update).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ id: 'col-1', isPrivate: true }),
        );
    });

    it('keeps a Collection visible via visibilityOverride even when the feed says deactivated', async () => {
        const { facetService, facetValueService, collectionService } = createServices({
            id: 'col-1',
            customFields: { visibilityOverride: 'visible' },
        });
        const handler = new CategoryStreamHandler(
            facetService as never,
            facetValueService as never,
            collectionService as never,
        );

        await handler.apply(ctx, 'cat-1', { name: 'Beverages', isActive: false });

        expect(collectionService.update).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ id: 'col-1', isPrivate: false }),
        );
    });

    it('honors the feed as usual when visibilityOverride is null', async () => {
        const { facetService, facetValueService, collectionService } = createServices({
            id: 'col-1',
            customFields: { visibilityOverride: null },
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

    // A deletion tombstone (isDeleted:true) never carries a name — confirmed against real
    // staging-integration payloads (mivend.issue.84.88 follow-up). Must still hide an
    // already-known category rather than silently skip the event (the previous behavior), and
    // must never blank its existing name translation while doing so.
    it('hides an existing Collection on a nameless deletion tombstone, never touching its name', async () => {
        const { facetService, facetValueService, collectionService } = createServices(
            { id: 'col-1', name: 'Beverages' },
            [{ id: 'fv-1', code: 'cat-1' }],
        );
        const handler = new CategoryStreamHandler(
            facetService as never,
            facetValueService as never,
            collectionService as never,
        );

        await handler.apply(ctx, 'cat-1', { isDeleted: true });

        expect(collectionService.update).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                id: 'col-1',
                isPrivate: true,
                translations: [expect.objectContaining({ name: 'Beverages' })],
            }),
        );
        expect(facetValueService.update).not.toHaveBeenCalled();
    });

    it('skips (no create/update anywhere) when name is missing and neither facet value nor Collection exist yet', async () => {
        const { facetService, facetValueService, collectionService } = createServices(undefined);
        const handler = new CategoryStreamHandler(
            facetService as never,
            facetValueService as never,
            collectionService as never,
        );

        await handler.apply(ctx, 'cat-1', { isDeleted: true });

        expect(collectionService.create).not.toHaveBeenCalled();
        expect(collectionService.update).not.toHaveBeenCalled();
        expect(facetValueService.create).not.toHaveBeenCalled();
        expect(facetValueService.update).not.toHaveBeenCalled();
    });

    it('a first-seen category with no existing Collection has no override to read and honors the feed', async () => {
        const { facetService, facetValueService, collectionService } = createServices(undefined);
        const handler = new CategoryStreamHandler(
            facetService as never,
            facetValueService as never,
            collectionService as never,
        );

        await handler.apply(ctx, 'cat-1', { name: 'Beverages', isActive: false });

        expect(collectionService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ isPrivate: true }),
        );
    });
});
