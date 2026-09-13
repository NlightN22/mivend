import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrganizationStreamHandler } from '../../handlers/organization.handler';

describe('OrganizationStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when name is missing', async () => {
        const documentsService = { upsertActiveState: vi.fn() };
        const handler = new OrganizationStreamHandler(documentsService as never);

        await handler.apply(ctx, 'org-1', {});

        expect(documentsService.upsertActiveState).not.toHaveBeenCalled();
    });

    it('upserts name + isActive, never fabricating legal fields', async () => {
        const documentsService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new OrganizationStreamHandler(documentsService as never);

        await handler.apply(ctx, 'org-1', { name: 'Acme LLC', isActive: false });

        expect(documentsService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'org-1',
            'Acme LLC',
            false,
        );
    });

    it('defaults isActive to true when absent', async () => {
        const documentsService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new OrganizationStreamHandler(documentsService as never);

        await handler.apply(ctx, 'org-1', { name: 'Acme LLC' });

        expect(documentsService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'org-1',
            'Acme LLC',
            true,
        );
    });

    it('creates a row (issue #88) when no matching OrganizationRequisites exists yet', async () => {
        const documentsService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new OrganizationStreamHandler(documentsService as never);

        await expect(
            handler.apply(ctx, 'org-unknown', { name: 'Not yet synced' }),
        ).resolves.toBeUndefined();
        expect(documentsService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'org-unknown',
            'Not yet synced',
            true,
        );
    });
});
