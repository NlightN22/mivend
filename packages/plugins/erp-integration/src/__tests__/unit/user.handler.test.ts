import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { UserStreamHandler } from '../../handlers/user.handler';

describe('UserStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('passes fullName/email/departmentId through to linkAndEnrich', async () => {
        const userEnrichmentService = {
            linkAndEnrich: vi.fn().mockResolvedValue({ id: 'admin-1' }),
        };
        const handler = new UserStreamHandler(userEnrichmentService as never);

        await handler.apply(ctx, 'user-1', {
            fullName: 'Ivan Ivanov',
            email: 'ivan@example.com',
            departmentId: 'dept-1',
            isActive: true,
        });

        expect(userEnrichmentService.linkAndEnrich).toHaveBeenCalledWith(ctx, {
            erpId: 'user-1',
            email: 'ivan@example.com',
            departmentId: 'dept-1',
            fullName: 'Ivan Ivanov',
            isActive: true,
        });
    });

    it('passes undefined for email/departmentId/fullName when absent from the payload', async () => {
        const userEnrichmentService = {
            linkAndEnrich: vi.fn().mockResolvedValue(null),
        };
        const handler = new UserStreamHandler(userEnrichmentService as never);

        await handler.apply(ctx, 'user-1', {});

        expect(userEnrichmentService.linkAndEnrich).toHaveBeenCalledWith(ctx, {
            erpId: 'user-1',
            email: undefined,
            departmentId: undefined,
            fullName: undefined,
            isActive: false,
        });
    });

    // Absent isActive means false, not true (proto3 bool zero-value omission) — same rule every
    // sibling handler (organization/counterparty/price-type) already applies.
    it('computes isActive=false when isActive is absent, even with other fields present', async () => {
        const userEnrichmentService = {
            linkAndEnrich: vi.fn().mockResolvedValue({ id: 'admin-1' }),
        };
        const handler = new UserStreamHandler(userEnrichmentService as never);

        await handler.apply(ctx, 'user-1', { fullName: 'Ivan Ivanov' });

        expect(userEnrichmentService.linkAndEnrich).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ isActive: false }),
        );
    });

    it('computes isActive=false when isDeleted is true, even if isActive is also true', async () => {
        const userEnrichmentService = {
            linkAndEnrich: vi.fn().mockResolvedValue({ id: 'admin-1' }),
        };
        const handler = new UserStreamHandler(userEnrichmentService as never);

        await handler.apply(ctx, 'user-1', { isActive: true, isDeleted: true });

        expect(userEnrichmentService.linkAndEnrich).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ isActive: false }),
        );
    });

    it('resolves without error when no Administrator is linked (skip, no fabrication)', async () => {
        const userEnrichmentService = {
            linkAndEnrich: vi.fn().mockResolvedValue(null),
        };
        const handler = new UserStreamHandler(userEnrichmentService as never);

        await expect(
            handler.apply(ctx, 'user-unknown', { fullName: 'Nobody' }),
        ).resolves.toBeUndefined();
    });
});
