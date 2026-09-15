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

    // Integration Service encodes isActive as a plain (non-optional) proto3 bool — proto3 JSON
    // encoding omits a scalar field equal to its zero-value, so `isActive:false` is NEVER sent
    // explicitly, only as an absent key (confirmed live with Search Platform, mivend#89's
    // follow-up). Absent must read as false, not true.
    it('defaults isActive to false when absent (proto3 omits the false zero-value)', async () => {
        const documentsService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new OrganizationStreamHandler(documentsService as never);

        await handler.apply(ctx, 'org-1', { name: 'Acme LLC' });

        expect(documentsService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'org-1',
            'Acme LLC',
            false,
        );
    });

    // isDeleted must fold into isActive the same way every sibling handler does (warehouse/
    // price/stock/category) — Integration Service can send isActive:true and isDeleted:true on
    // the same event. This handler previously ignored isDeleted entirely, leaving a deleted
    // organization permanently isActive:true locally and overcounted by
    // ReconciliationLocalCountsService.countActiveOrganizations (same class of bug #90 fixed for
    // categories via isPrivate).
    it('treats isDeleted:true as inactive even when isActive is true', async () => {
        const documentsService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new OrganizationStreamHandler(documentsService as never);

        await handler.apply(ctx, 'org-1', {
            name: 'Acme LLC',
            isActive: true,
            isDeleted: true,
        });

        expect(documentsService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'org-1',
            'Acme LLC',
            false,
        );
    });

    it('stays active when isDeleted is absent (proto3 omits the false zero-value)', async () => {
        const documentsService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new OrganizationStreamHandler(documentsService as never);

        await handler.apply(ctx, 'org-1', { name: 'Acme LLC', isActive: true });

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
            false,
        );
    });
});
