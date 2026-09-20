import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

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
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        const connection = { getRepository: () => repo };
        service = new UserEnrichmentService(connection as unknown as TransactionalConnection);
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

        // Never creates an Administrator — account provisioning stays manual.
        it('returns null and does not save when no Administrator matches by email', async () => {
            repo.findOne
                .mockResolvedValueOnce(null) // findByErpId
                .mockResolvedValueOnce(null); // by email

            const result = await service.linkAndEnrich(ctx, {
                erpId: 'user-1',
                email: 'nobody@example.com',
            });

            expect(result).toBeNull();
            expect(repo.save).not.toHaveBeenCalled();
        });

        // No email to match by and no existing link — an ordinary, expected case (e.g. a
        // deletion tombstone), not an error.
        it('returns null when unlinked and no email is available to match by', async () => {
            repo.findOne.mockResolvedValueOnce(null);

            const result = await service.linkAndEnrich(ctx, { erpId: 'user-1' });

            expect(result).toBeNull();
            expect(repo.save).not.toHaveBeenCalled();
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

    describe('findAdministratorIdByErpId', () => {
        it('returns the linked Administrator id when a link exists', async () => {
            repo.findOne.mockResolvedValue({ id: 'admin-1' });
            const result = await service.findAdministratorIdByErpId(ctx, 'user-1');
            expect(result).toBe('admin-1');
        });

        it('returns null when no Administrator is linked to that erpId yet', async () => {
            repo.findOne.mockResolvedValue(null);
            const result = await service.findAdministratorIdByErpId(ctx, 'user-unknown');
            expect(result).toBeNull();
        });
    });
});
