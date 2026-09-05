import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { StorageLocationStreamHandler } from '../../handlers/storage-location.handler';

// Two different raw queries run per apply() call (findVariantId, getCurrentAssignment) — this
// stub returns queued results in call order, mirroring warehouse.handler.test.ts's connection
// stub shape but supporting more than one query per test.
function createConnection(results: Array<Record<string, unknown> | undefined>): {
    rawConnection: { createQueryBuilder: () => unknown };
} {
    let i = 0;
    const builder = (): unknown => ({
        select: () => builder(),
        from: () => builder(),
        innerJoin: () => builder(),
        where: () => ({ getRawOne: vi.fn().mockResolvedValue(results[i++]) }),
    });
    return { rawConnection: { createQueryBuilder: () => builder() } };
}

describe('StorageLocationStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when productId is missing', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn() };
        const handler = new StorageLocationStreamHandler(
            createConnection([]) as never,
            productVariantService as never,
            documentsService as never,
        );

        await handler.apply(ctx, 'loc-1', { organizationId: 'org-1', priority: 1 });

        expect(productVariantService.update).not.toHaveBeenCalled();
    });

    it('is a no-op when organizationId is absent (the ~99.99% address-only case) — never blanks a prior assignment', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn() };
        const handler = new StorageLocationStreamHandler(
            createConnection([]) as never,
            productVariantService as never,
            documentsService as never,
        );

        await handler.apply(ctx, 'loc-1', { productId: 'prod-1', priority: 1 });

        expect(productVariantService.update).not.toHaveBeenCalled();
        expect(documentsService.findRequisitesIdByErpId).not.toHaveBeenCalled();
    });

    it('is a no-op when the row is deleted, even with an organizationId present', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn() };
        const handler = new StorageLocationStreamHandler(
            createConnection([]) as never,
            productVariantService as never,
            documentsService as never,
        );

        await handler.apply(ctx, 'loc-1', {
            productId: 'prod-1',
            organizationId: 'org-1',
            priority: 1,
            isDeleted: true,
        });

        expect(productVariantService.update).not.toHaveBeenCalled();
    });

    it('skips when the product variant is not found yet', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn() };
        const handler = new StorageLocationStreamHandler(
            createConnection([undefined]) as never,
            productVariantService as never,
            documentsService as never,
        );

        await handler.apply(ctx, 'loc-1', {
            productId: 'prod-missing',
            organizationId: 'org-1',
            priority: 1,
        });

        expect(productVariantService.update).not.toHaveBeenCalled();
    });

    it('skips when no OrganizationRequisites is found for the organizationId yet', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn().mockResolvedValue(null) };
        const handler = new StorageLocationStreamHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            productVariantService as never,
            documentsService as never,
        );

        await handler.apply(ctx, 'loc-1', {
            productId: 'prod-1',
            organizationId: 'org-unknown',
            priority: 1,
        });

        expect(productVariantService.update).not.toHaveBeenCalled();
    });

    it('sets organizationId + organizationPriority when no prior assignment exists', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn().mockResolvedValue(42) };
        const handler = new StorageLocationStreamHandler(
            createConnection([{ id: 'variant-1' }, undefined]) as never,
            productVariantService as never,
            documentsService as never,
        );

        await handler.apply(ctx, 'loc-1', {
            productId: 'prod-1',
            organizationId: 'org-1',
            priority: 5,
        });

        expect(productVariantService.update).toHaveBeenCalledWith(ctx, [
            { id: 'variant-1', customFields: { organizationId: 42, organizationPriority: 5 } },
        ]);
    });

    it('a lower-priority row overrides the current winner (lower priority wins)', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn().mockResolvedValue(99) };
        const handler = new StorageLocationStreamHandler(
            createConnection([{ id: 'variant-1' }, { organizationPriority: 5 }]) as never,
            productVariantService as never,
            documentsService as never,
        );

        await handler.apply(ctx, 'loc-2', {
            productId: 'prod-1',
            organizationId: 'org-2',
            priority: 1,
        });

        expect(productVariantService.update).toHaveBeenCalledWith(ctx, [
            { id: 'variant-1', customFields: { organizationId: 99, organizationPriority: 1 } },
        ]);
    });

    it('a higher-priority row does NOT override the current winner (out-of-order arrival across different storage-location entities)', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn().mockResolvedValue(99) };
        const handler = new StorageLocationStreamHandler(
            createConnection([{ id: 'variant-1' }, { organizationPriority: 1 }]) as never,
            productVariantService as never,
            documentsService as never,
        );

        await handler.apply(ctx, 'loc-2', {
            productId: 'prod-1',
            organizationId: 'org-2',
            priority: 5,
        });

        expect(productVariantService.update).not.toHaveBeenCalled();
    });
});
