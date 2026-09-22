import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';

import type { AdministratorActivationService } from '../../administrator-activation.service';
import type { ErpUserService } from '../../erp-user.service';
import { AdministratorLinkedEvent } from '../../administrator-linked.event';
import { UserEnrichmentService } from '../../user-enrichment.service';

function createMockRepo(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        findOne: vi.fn(),
        save: vi.fn(async (x: unknown) => x),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

describe('UserEnrichmentService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let service: UserEnrichmentService;
    let erpUserService: {
        upsert: ReturnType<typeof vi.fn>;
        markLinked: ReturnType<typeof vi.fn>;
        findByErpId: ReturnType<typeof vi.fn>;
    };
    let administratorActivationService: { syncFromErp: ReturnType<typeof vi.fn> };
    let eventBus: { publish: ReturnType<typeof vi.fn> };
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        const connection = { getRepository: () => repo };
        erpUserService = { upsert: vi.fn(), markLinked: vi.fn(), findByErpId: vi.fn() };
        administratorActivationService = { syncFromErp: vi.fn() };
        eventBus = { publish: vi.fn() };
        service = new UserEnrichmentService(
            connection as unknown as TransactionalConnection,
            erpUserService as unknown as ErpUserService,
            administratorActivationService as unknown as AdministratorActivationService,
            eventBus as unknown as EventBus,
        );
    });

    describe('linkAndEnrich', () => {
        it('matches by email and persists erpId when no Administrator is linked yet', async () => {
            repo.findOne
                .mockResolvedValueOnce(null) // findByErpId
                .mockResolvedValueOnce({ id: 'admin-1', customFields: {} }); // by email

            const result = await service.linkAndEnrich(ctx, {
                erpId: 'user-1',
                email: 'admin@example.com',
                departmentId: 'dept-1',
            });

            expect(repo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'admin-1',
                    customFields: { erpId: 'user-1', departmentId: 'dept-1' },
                }),
            );
            expect(result).toEqual(expect.objectContaining({ id: 'admin-1' }));
        });

        it('matches by erpId directly on subsequent events, no email lookup needed', async () => {
            repo.findOne.mockResolvedValueOnce({
                id: 'admin-1',
                customFields: { erpId: 'user-1' },
            });

            await service.linkAndEnrich(ctx, { erpId: 'user-1', departmentId: 'dept-2' });

            expect(repo.findOne).toHaveBeenCalledTimes(1);
            expect(repo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    customFields: { erpId: 'user-1', departmentId: 'dept-2' },
                }),
            );
        });

        // Never creates an Administrator — account provisioning stays manual. Issue #119:
        // surfaced as an ErpUser candidate instead.
        it('returns null, does not save, and upserts an unlinked ErpUser when no Administrator matches by email', async () => {
            repo.findOne
                .mockResolvedValueOnce(null) // findByErpId
                .mockResolvedValueOnce(null); // by email

            const result = await service.linkAndEnrich(ctx, {
                erpId: 'user-1',
                email: 'nobody@example.com',
                fullName: 'Nobody Home',
                departmentId: 'dept-1',
            });

            expect(result).toBeNull();
            expect(repo.save).not.toHaveBeenCalled();
            expect(erpUserService.upsert).toHaveBeenCalledWith(ctx, {
                erpId: 'user-1',
                fullName: 'Nobody Home',
                email: 'nobody@example.com',
                departmentId: 'dept-1',
                active: undefined,
            });
        });

        // No email to match by and no existing link, but still active in the ERP — an ordinary,
        // expected case, not an error. Still surfaced as a candidate.
        it('returns null and upserts an unlinked ErpUser when unlinked and no email is available to match by', async () => {
            repo.findOne.mockResolvedValueOnce(null);

            const result = await service.linkAndEnrich(ctx, { erpId: 'user-1' });

            expect(result).toBeNull();
            expect(repo.save).not.toHaveBeenCalled();
            expect(erpUserService.upsert).toHaveBeenCalledWith(ctx, {
                erpId: 'user-1',
                fullName: undefined,
                email: undefined,
                departmentId: undefined,
                active: undefined,
            });
        });

        // Issue #119 follow-up: a deleted/inactive ERP user must never show a "Create
        // Administrator" action — confirmed live against real staging data. mivend.audit.common
        // (2026-09-20): the row itself is now kept, not deleted, just flagged active:false so
        // ErpUserService.findAllPaginated excludes it from the Pending list.
        it('upserts the ErpUser with active:false, never as a create-candidate, when isActive is false and unlinked', async () => {
            repo.findOne.mockResolvedValueOnce(null); // findByErpId

            const result = await service.linkAndEnrich(ctx, {
                erpId: 'user-1',
                email: 'nobody@example.com',
                fullName: 'Deleted Person',
                isActive: false,
            });

            expect(result).toBeNull();
            expect(erpUserService.upsert).toHaveBeenCalledWith(ctx, {
                erpId: 'user-1',
                fullName: 'Deleted Person',
                email: 'nobody@example.com',
                departmentId: undefined,
                active: false,
            });
            expect(erpUserService.markLinked).not.toHaveBeenCalled();
            // No email-match lookup attempted at all — deciding "inactive" short-circuits before it.
            expect(repo.findOne).toHaveBeenCalledTimes(1);
        });

        it('flips the ErpUser row to linked (never deletes it) and publishes AdministratorLinkedEvent the moment an email-match link is established', async () => {
            repo.findOne
                .mockResolvedValueOnce(null) // findByErpId
                .mockResolvedValueOnce({ id: 'admin-1', customFields: {} }); // by email

            await service.linkAndEnrich(ctx, { erpId: 'user-1', email: 'admin@example.com' });

            expect(erpUserService.markLinked).toHaveBeenCalledWith(ctx, 'user-1', 'admin-1');
            expect(eventBus.publish).toHaveBeenCalledWith(expect.any(AdministratorLinkedEvent));
            const published = eventBus.publish.mock.calls[0][0] as AdministratorLinkedEvent;
            expect(published.erpId).toBe('user-1');
            expect(published.administratorId).toBe('admin-1');
        });

        it('delegates to AdministratorActivationService.syncFromErp when isActive is present', async () => {
            repo.findOne.mockResolvedValueOnce({
                id: 'admin-1',
                customFields: { erpId: 'user-1' },
            });

            await service.linkAndEnrich(ctx, { erpId: 'user-1', isActive: false });

            expect(administratorActivationService.syncFromErp).toHaveBeenCalledWith(
                ctx,
                'user-1',
                false,
            );
        });

        it('does not call syncFromErp when isActive is omitted', async () => {
            repo.findOne.mockResolvedValueOnce({
                id: 'admin-1',
                customFields: { erpId: 'user-1' },
            });

            await service.linkAndEnrich(ctx, { erpId: 'user-1' });

            expect(administratorActivationService.syncFromErp).not.toHaveBeenCalled();
        });

        // `departmentId: undefined` (omitted from the event) must leave the existing value
        // untouched — never overwritten with null just because the event didn't carry it.
        it('leaves departmentId untouched when omitted from the input', async () => {
            repo.findOne.mockResolvedValueOnce({
                id: 'admin-1',
                customFields: { erpId: 'user-1', departmentId: 'dept-old' },
            });

            await service.linkAndEnrich(ctx, { erpId: 'user-1' });

            expect(repo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    customFields: { erpId: 'user-1', departmentId: 'dept-old' },
                }),
            );
        });
    });

    describe('findManagerLink', () => {
        it('returns found:false when no ErpUser row exists for the erpId (a real race)', async () => {
            erpUserService.findByErpId.mockResolvedValue(null);

            const result = await service.findManagerLink(ctx, 'user-unknown');

            expect(result).toEqual({ found: false });
        });

        it('returns found:true, administratorId:null for a known but still-unlinked row (not a race)', async () => {
            erpUserService.findByErpId.mockResolvedValue({
                erpId: 'user-1',
                status: 'unlinked',
                administratorId: null,
            });

            const result = await service.findManagerLink(ctx, 'user-1');

            expect(result).toEqual({ found: true, administratorId: null });
        });

        it('returns found:true with the administratorId for a linked row', async () => {
            erpUserService.findByErpId.mockResolvedValue({
                erpId: 'user-1',
                status: 'linked',
                administratorId: 'admin-1',
            });

            const result = await service.findManagerLink(ctx, 'user-1');

            expect(result).toEqual({ found: true, administratorId: 'admin-1' });
        });
    });
});
