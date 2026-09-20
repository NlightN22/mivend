import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { UserStreamHandler } from '../../handlers/user.handler';

describe('UserStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('passes email/departmentId through to linkAndEnrich', async () => {
        const userEnrichmentService = {
            linkAndEnrich: vi.fn().mockResolvedValue({ id: 'admin-1' }),
        };
        const handler = new UserStreamHandler(userEnrichmentService as never);

        await handler.apply(ctx, 'user-1', {
            fullName: 'Ivan Ivanov',
            email: 'ivan@example.com',
            departmentId: 'dept-1',
        });

        expect(userEnrichmentService.linkAndEnrich).toHaveBeenCalledWith(ctx, {
            erpId: 'user-1',
            email: 'ivan@example.com',
            departmentId: 'dept-1',
        });
    });

    it('passes undefined for email/departmentId when absent from the payload', async () => {
        const userEnrichmentService = {
            linkAndEnrich: vi.fn().mockResolvedValue(null),
        };
        const handler = new UserStreamHandler(userEnrichmentService as never);

        await handler.apply(ctx, 'user-1', { fullName: 'Ivan Ivanov' });

        expect(userEnrichmentService.linkAndEnrich).toHaveBeenCalledWith(ctx, {
            erpId: 'user-1',
            email: undefined,
            departmentId: undefined,
        });
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
