import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { StockOrganizationStreamHandler } from '../../handlers/stock-organization.handler';

function setup(affected = 1) {
    const repo = {
        upsert: vi.fn(),
        delete: vi.fn().mockResolvedValue({ affected }),
        find: vi.fn().mockResolvedValue(affected ? [{ productId: 'p-1' }] : []),
    };
    const connection = {
        withTransaction: vi.fn((ctx: RequestContext, work: (c: RequestContext) => unknown) =>
            work(ctx),
        ),
        getRepository: vi.fn(() => ({ ...repo, query: vi.fn() })),
    };
    const stale = { requestForProducts: vi.fn().mockResolvedValue(undefined), drainSoon: vi.fn() };
    return {
        repo,
        connection,
        stale,
        handler: new StockOrganizationStreamHandler(connection as never, stale as never),
    };
}
const ctx = {} as RequestContext;

describe('StockOrganizationStreamHandler', () => {
    it('upserts by product and organization, absent quantity means 0, absent isActive means active', async () => {
        const { repo, handler } = setup();

        const outcome = await handler.apply(ctx, 'e-1', {
            productId: 'p-1',
            organizationId: 'o-1',
        });

        expect(outcome).toMatchObject({ kind: 'applied' });
        expect(repo.upsert).toHaveBeenCalledWith(
            {
                entityId: 'e-1',
                productId: 'p-1',
                organizationErpId: 'o-1',
                quantity: 0,
                isActive: true,
            },
            ['productId', 'organizationErpId'],
        );
    });

    it('keeps a negative quantity and an explicit isActive=false', async () => {
        const { repo, handler } = setup();

        await handler.apply(ctx, 'e-1', {
            productId: 'p-1',
            organizationId: 'o-1',
            quantity: -3.5,
            isActive: false,
        });

        expect(repo.upsert.mock.calls[0][0]).toMatchObject({ quantity: -3.5, isActive: false });
    });

    it('deletes the row on a tombstone, even without product/organization', async () => {
        const { repo, handler } = setup();

        const outcome = await handler.apply(ctx, 'e-1', { isDeleted: true });

        expect(outcome).toMatchObject({ kind: 'applied' });
        expect(repo.delete).toHaveBeenCalledWith({ entityId: 'e-1' });
        expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('flags the orders of the product after a change and after a tombstone, not after a noop', async () => {
        const first = setup();
        await first.handler.apply(ctx, 'e-1', { productId: 'p-2', organizationId: 'o-1' });
        expect(first.stale.requestForProducts).toHaveBeenCalledWith(ctx, ['p-2']);

        const tombstone = setup();
        await tombstone.handler.apply(ctx, 'e-1', { isDeleted: true });
        expect(tombstone.stale.requestForProducts).toHaveBeenCalledWith(ctx, ['p-1']);

        const unknown = setup(0);
        await unknown.handler.apply(ctx, 'e-1', { isDeleted: true });
        expect(unknown.stale.requestForProducts).not.toHaveBeenCalled();
    });

    it('flags every product of the rows that share one entity id', async () => {
        const { repo, stale, handler } = setup();
        repo.find.mockResolvedValue([
            { productId: 'p-1' },
            { productId: 'p-2' },
            { productId: 'p-1' },
        ]);

        await handler.apply(ctx, 'e-1', { isDeleted: true });

        expect(stale.requestForProducts).toHaveBeenCalledWith(ctx, ['p-1', 'p-2']);
    });

    it('is a noop for a tombstone of an unknown row', async () => {
        const { handler } = setup(0);

        expect(await handler.apply(ctx, 'e-1', { isDeleted: true })).toMatchObject({
            kind: 'noop',
        });
    });

    it('skips a row without productId or organizationId without touching the database', async () => {
        const { connection, handler } = setup();

        const outcome = await handler.apply(ctx, 'e-1', { organizationId: 'o-1', quantity: 2 });

        expect(outcome).toMatchObject({ kind: 'noop' });
        expect(connection.withTransaction).not.toHaveBeenCalled();
    });
});
