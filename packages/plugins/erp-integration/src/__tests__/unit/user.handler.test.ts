import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { UserStreamHandler } from '../../handlers/user.handler';

describe('UserStreamHandler', () => {
    const ctx = {} as RequestContext;
    const setup = (admin: unknown) => {
        const userEnrichmentService = { linkAndEnrich: vi.fn().mockResolvedValue(admin) };
        return {
            userEnrichmentService,
            handler: new UserStreamHandler(userEnrichmentService as never),
        };
    };

    it('passes only fullName and activity to linkAndEnrich: e-mail, department and position are not sent', async () => {
        const { handler, userEnrichmentService } = setup({ id: 'admin-1' });

        await handler.apply(ctx, 'user-1', { fullName: 'Ivan Ivanov', isActive: true });

        expect(userEnrichmentService.linkAndEnrich).toHaveBeenCalledWith(ctx, {
            erpId: 'user-1',
            fullName: 'Ivan Ivanov',
            isActive: true,
        });
    });

    it('passes an undefined fullName when absent from the payload', async () => {
        const { handler, userEnrichmentService } = setup(null);

        await handler.apply(ctx, 'user-1', {});

        expect(userEnrichmentService.linkAndEnrich).toHaveBeenCalledWith(ctx, {
            erpId: 'user-1',
            fullName: undefined,
            isActive: false,
        });
    });

    // Absent isActive means false, not true (proto3 bool zero-value omission) — same rule every
    // sibling handler (organization/counterparty/price-type) already applies.
    it('computes isActive=false when isActive is absent, even with other fields present', async () => {
        const { handler, userEnrichmentService } = setup({ id: 'admin-1' });

        await handler.apply(ctx, 'user-1', { fullName: 'Ivan Ivanov' });

        expect(userEnrichmentService.linkAndEnrich).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ isActive: false }),
        );
    });

    it('computes isActive=false when isDeleted is true, even if isActive is also true', async () => {
        const { handler, userEnrichmentService } = setup({ id: 'admin-1' });

        await handler.apply(ctx, 'user-1', { isActive: true, isDeleted: true });

        expect(userEnrichmentService.linkAndEnrich).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ isActive: false }),
        );
    });

    it('resolves without error when no Administrator is linked (skip, no fabrication)', async () => {
        const { handler } = setup(null);

        await expect(handler.apply(ctx, 'user-unknown', { fullName: 'Nobody' })).resolves.toEqual({
            kind: 'noop',
            reason: expect.any(String),
        });
    });
});
