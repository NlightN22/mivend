import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { StorageLocationStreamHandler } from '../../handlers/storage-location.handler';

// Every apply() call runs 0-2 raw queries in order (findVariantId, then getCurrentAssignment when
// applicable) — this stub returns queued results in call order, mirroring
// warehouse.handler.test.ts's connection stub shape but supporting more than one query per test.
function createConnection(results: Array<Record<string, unknown> | undefined>): {
    rawConnection: { createQueryBuilder: () => unknown };
} {
    let i = 0;
    const builder = (): unknown => ({
        select: () => builder(),
        addSelect: () => builder(),
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

    it('sets organizationId + organizationPriority + organizationSourceEntityId when no prior assignment exists', async () => {
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
            {
                id: 'variant-1',
                customFields: {
                    organizationId: 42,
                    organizationPriority: 5,
                    organizationSourceEntityId: 'loc-1',
                },
            },
        ]);
    });

    it('a lower-priority row overrides the current winner (lower priority wins)', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn().mockResolvedValue(99) };
        const handler = new StorageLocationStreamHandler(
            createConnection([
                { id: 'variant-1' },
                { organizationPriority: 5, organizationSourceEntityId: 'loc-1' },
            ]) as never,
            productVariantService as never,
            documentsService as never,
        );

        await handler.apply(ctx, 'loc-2', {
            productId: 'prod-1',
            organizationId: 'org-2',
            priority: 1,
        });

        expect(productVariantService.update).toHaveBeenCalledWith(ctx, [
            {
                id: 'variant-1',
                customFields: {
                    organizationId: 99,
                    organizationPriority: 1,
                    organizationSourceEntityId: 'loc-2',
                },
            },
        ]);
    });

    it('a higher-priority row does NOT override the current winner (out-of-order arrival across different storage-location entities)', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn().mockResolvedValue(99) };
        const handler = new StorageLocationStreamHandler(
            createConnection([
                { id: 'variant-1' },
                { organizationPriority: 1, organizationSourceEntityId: 'loc-1' },
            ]) as never,
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

    it('equal priority: the lower entityId wins deterministically, regardless of arrival order (mivend.audit.71)', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn().mockResolvedValue(99) };
        const handler = new StorageLocationStreamHandler(
            createConnection([
                { id: 'variant-1' },
                { organizationPriority: 3, organizationSourceEntityId: 'loc-b' },
            ]) as never,
            productVariantService as never,
            documentsService as never,
        );

        // 'loc-a' < 'loc-b' lexically — should win the tie even though 'loc-b' arrived first.
        await handler.apply(ctx, 'loc-a', {
            productId: 'prod-1',
            organizationId: 'org-2',
            priority: 3,
        });

        expect(productVariantService.update).toHaveBeenCalledWith(ctx, [
            {
                id: 'variant-1',
                customFields: {
                    organizationId: 99,
                    organizationPriority: 3,
                    organizationSourceEntityId: 'loc-a',
                },
            },
        ]);
    });

    it('equal priority: a lexically-higher entityId does NOT override the current winner', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn().mockResolvedValue(99) };
        const handler = new StorageLocationStreamHandler(
            createConnection([
                { id: 'variant-1' },
                { organizationPriority: 3, organizationSourceEntityId: 'loc-a' },
            ]) as never,
            productVariantService as never,
            documentsService as never,
        );

        await handler.apply(ctx, 'loc-b', {
            productId: 'prod-1',
            organizationId: 'org-2',
            priority: 3,
        });

        expect(productVariantService.update).not.toHaveBeenCalled();
    });

    it('deleting the current winning row clears the organization assignment (mivend.audit.71 HIGH)', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn() };
        const handler = new StorageLocationStreamHandler(
            createConnection([
                { id: 'variant-1' },
                { organizationPriority: 1, organizationSourceEntityId: 'loc-1' },
            ]) as never,
            productVariantService as never,
            documentsService as never,
        );

        await handler.apply(ctx, 'loc-1', {
            productId: 'prod-1',
            organizationId: 'org-1',
            priority: 1,
            isDeleted: true,
        });

        expect(productVariantService.update).toHaveBeenCalledWith(ctx, [
            {
                id: 'variant-1',
                customFields: {
                    organizationId: null,
                    organizationPriority: null,
                    organizationSourceEntityId: null,
                },
            },
        ]);
    });

    it('deleting a NON-winning row is a no-op — does not clear an unrelated organization assignment', async () => {
        const productVariantService = { update: vi.fn() };
        const documentsService = { findRequisitesIdByErpId: vi.fn() };
        const handler = new StorageLocationStreamHandler(
            createConnection([
                { id: 'variant-1' },
                { organizationPriority: 1, organizationSourceEntityId: 'loc-1' },
            ]) as never,
            productVariantService as never,
            documentsService as never,
        );

        await handler.apply(ctx, 'loc-2', {
            productId: 'prod-1',
            organizationId: 'org-2',
            priority: 5,
            isDeleted: true,
        });

        expect(productVariantService.update).not.toHaveBeenCalled();
    });

    it('deletion is a no-op when the product variant is not found', async () => {
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
            isDeleted: true,
        });

        expect(productVariantService.update).not.toHaveBeenCalled();
    });
});
