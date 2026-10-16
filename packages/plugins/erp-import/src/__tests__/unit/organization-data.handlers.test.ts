import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import type { TransactionalConnection } from '@vendure/core';
import { StockOrganizationHandler } from '../../handlers/stock-organization.handler';
import { StorageLocationHandler } from '../../handlers/storage-location.handler';

const ctx = {} as RequestContext;

function connection() {
    const query = vi.fn(async () => undefined);
    return { query, conn: { rawConnection: { query } } as unknown as TransactionalConnection };
}

describe('organization data import handlers', () => {
    it('stock organization upserts on (product, organization), isActive defaults to true', async () => {
        const { query, conn } = connection();
        await new StockOrganizationHandler(conn).upsert(ctx, {
            entityId: 'so-1',
            productErpId: 'p-1',
            organizationErpId: 'org-001',
            quantity: -2,
        });
        const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
        expect(sql).toContain('ON CONFLICT ("productId", "organizationErpId")');
        expect(params).toEqual(['so-1', 'p-1', 'org-001', -2, true]);
    });

    it('storage location upserts on entityId, priority defaults to 0', async () => {
        const { query, conn } = connection();
        await new StorageLocationHandler(conn).upsert(ctx, {
            entityId: 'sl-1',
            productErpId: 'p-1',
            organizationErpId: 'org-001',
            warehouseErpId: 'wh-1',
        });
        const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
        expect(sql).toContain('ON CONFLICT ("entityId")');
        expect(params).toEqual(['sl-1', 'p-1', 'org-001', 'wh-1', 0]);
    });
});
