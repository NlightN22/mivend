import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrganizationStreamHandler } from '../../handlers/organization.handler';

describe('OrganizationStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when name is missing', async () => {
        const documentsService = { updateActiveStateIfExists: vi.fn() };
        const handler = new OrganizationStreamHandler(documentsService as never);

        await handler.apply(ctx, 'org-1', {});

        expect(documentsService.updateActiveStateIfExists).not.toHaveBeenCalled();
    });

    it('updates an existing OrganizationRequisites row (name + isActive), never fabricating legal fields', async () => {
        const documentsService = { updateActiveStateIfExists: vi.fn().mockResolvedValue(true) };
        const handler = new OrganizationStreamHandler(documentsService as never);

        await handler.apply(ctx, 'org-1', { name: 'Acme LLC', isActive: false });

        expect(documentsService.updateActiveStateIfExists).toHaveBeenCalledWith(
            ctx,
            'org-1',
            'Acme LLC',
            false,
        );
    });

    it('defaults isActive to true when absent', async () => {
        const documentsService = { updateActiveStateIfExists: vi.fn().mockResolvedValue(true) };
        const handler = new OrganizationStreamHandler(documentsService as never);

        await handler.apply(ctx, 'org-1', { name: 'Acme LLC' });

        expect(documentsService.updateActiveStateIfExists).toHaveBeenCalledWith(
            ctx,
            'org-1',
            'Acme LLC',
            true,
        );
    });

    it('does not throw when no matching OrganizationRequisites exists yet (skip, not create)', async () => {
        const documentsService = { updateActiveStateIfExists: vi.fn().mockResolvedValue(false) };
        const handler = new OrganizationStreamHandler(documentsService as never);

        await expect(
            handler.apply(ctx, 'org-unknown', { name: 'Not yet synced' }),
        ).resolves.toBeUndefined();
    });
});
