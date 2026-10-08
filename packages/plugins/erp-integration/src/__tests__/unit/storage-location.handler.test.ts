import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { StorageLocationStreamHandler } from '../../handlers/storage-location.handler';

// Winner election, re-election on delete and concurrency run against real Postgres in
// component/storage-location-winner.int.test.ts; only the input guard is checked here.
describe('StorageLocationStreamHandler', () => {
    it('skips a row without productId before touching the database', async () => {
        const connection = { withTransaction: vi.fn(), getRepository: vi.fn() };
        const handler = new StorageLocationStreamHandler(
            connection as never,
            { update: vi.fn() } as never,
            { findRequisitesIdByErpId: vi.fn() } as never,
        );

        const outcome = await handler.apply({} as RequestContext, 'loc-1', {
            organizationId: 'org-1',
            priority: 1,
        });

        expect(outcome).toMatchObject({ kind: 'noop' });
        expect(connection.withTransaction).not.toHaveBeenCalled();
    });
});
