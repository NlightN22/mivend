import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { ErpOrderResolver } from '../../erp-order.resolver';

function mockQueryBuilder(): Record<string, ReturnType<typeof vi.fn>> {
    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    qb.innerJoin = vi.fn(() => qb);
    qb.leftJoinAndSelect = vi.fn(() => qb);
    qb.leftJoin = vi.fn(() => qb);
    qb.where = vi.fn(() => qb);
    qb.andWhere = vi.fn(() => qb);
    qb.orderBy = vi.fn(() => qb);
    qb.take = vi.fn(() => qb);
    qb.skip = vi.fn(() => qb);
    qb.getManyAndCount = vi.fn(async () => [[], 0]);
    return qb;
}

const mockCtx = { activeUserId: 'user-1' } as unknown as RequestContext;

describe('ErpOrderResolver.myOrders', () => {
    let qb: ReturnType<typeof mockQueryBuilder>;
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let resolver: ErpOrderResolver;

    beforeEach(() => {
        qb = mockQueryBuilder();
        connection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb) })),
        };
        resolver = new ErpOrderResolver(connection as unknown as TransactionalConnection);
    });

    // Real incident this guards against: an admin-created Draft order (manager portal's
    // "+ New order", or any admin `createDraftOrder` call) that has a customer attached via
    // setCustomerForDraftOrder but was abandoned before ever being placed (0 lines, never
    // transitioned out of Draft) showed up permanently in that customer's storefront "My
    // Orders" list — a $0/0-item ghost order — because 'Draft' was missing from the state
    // exclusion list alongside 'AddingItems'/'Cancelled'.
    it("excludes 'Draft' (admin work-in-progress) alongside 'AddingItems'/'Cancelled'", async () => {
        await resolver.myOrders(mockCtx, {});

        expect(qb.andWhere).toHaveBeenCalledWith(
            "order.state NOT IN ('AddingItems', 'Draft', 'Cancelled')",
        );
    });

    it('returns no rows without querying when there is no active user', async () => {
        const result = await resolver.myOrders(
            { activeUserId: undefined } as unknown as RequestContext,
            {},
        );
        expect(result).toEqual({ items: [], totalItems: 0 });
        expect(connection.getRepository).not.toHaveBeenCalled();
    });
});
