import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrganizationStreamHandler } from '../../handlers/organization.handler';

describe('OrganizationStreamHandler', () => {
    const ctx = {} as RequestContext;

    // A deletion tombstone never carries a name (confirmed against real staging-integration
    // payloads, mivend.issue.84.88 follow-up) — the handler must still forward the update so an
    // already-known organization can be deactivated; DocumentsService.upsertActiveState is what
    // refuses to fabricate a brand-new row from a null name, not this handler.
    it('passes name:null through when the payload has no name (deletion tombstone)', async () => {
        const documentsService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new OrganizationStreamHandler(documentsService as never);

        await handler.apply(ctx, 'org-1', { isDeleted: true });

        expect(documentsService.upsertActiveState).toHaveBeenCalledWith(ctx, 'org-1', null, false);
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
