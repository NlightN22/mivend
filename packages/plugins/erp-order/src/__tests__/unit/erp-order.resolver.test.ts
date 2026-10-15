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
    let tradingPoints: { getCounterpartyIdForUser: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        qb = mockQueryBuilder();
        connection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb) })),
        };
        tradingPoints = { getCounterpartyIdForUser: vi.fn().mockResolvedValue('cp-1') };
        resolver = new ErpOrderResolver(
            connection as unknown as TransactionalConnection,
            tradingPoints as never,
        );
    });

    // 'Draft' must be excluded with 'AddingItems': abandoned admin drafts with a customer attached
    // otherwise show up in the storefront My Orders as $0 ghost orders.
    it("excludes 'Draft' (admin work-in-progress) alongside 'AddingItems', keeps 'Cancelled'", async () => {
        await resolver.myOrders(mockCtx, {});

        expect(qb.andWhere).toHaveBeenCalledWith("order.state NOT IN ('AddingItems', 'Draft')");
    });

    it('an empty erpStatus.in set returns nothing instead of dropping the filter', async () => {
        const result = await resolver.myOrders(mockCtx, {
            options: { filter: { erpStatus: { in: [] } } } as never,
        });
        expect(result).toEqual({ items: [], totalItems: 0 });
        expect(qb.getManyAndCount).not.toHaveBeenCalled();
    });

    it('erpStatus.notIn keeps null-status orders and excludes the listed codes', async () => {
        await resolver.myOrders(mockCtx, {
            options: { filter: { erpStatus: { notIn: ['DELIVERED'] } } } as never,
        });
        expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('IS NULL OR'), {
            excludedStatuses: ['DELIVERED'],
        });
    });

    it('returns no rows without querying when there is no active user', async () => {
        const result = await resolver.myOrders(
            { activeUserId: undefined } as unknown as RequestContext,
            {},
        );
        expect(result).toEqual({ items: [], totalItems: 0 });
        expect(connection.getRepository).not.toHaveBeenCalled();
    });

    it("scopes external orders to the user's own counterparty id only", async () => {
        const brackets: Array<{ whereFactory: (b: unknown) => void }> = [];
        qb.where = vi.fn((arg: { whereFactory: (b: unknown) => void }) => {
            brackets.push(arg);
            return qb;
        });
        await resolver.myOrders(mockCtx, {});

        const inner = { where: vi.fn(() => inner), orWhere: vi.fn(() => inner) };
        brackets[0].whereFactory(inner);
        expect(inner.orWhere).toHaveBeenCalledWith(expect.stringContaining('Isexternal'), {
            counterpartyId: 'cp-1',
        });
    });

    it('adds no counterparty branch for a user without a counterparty', async () => {
        tradingPoints.getCounterpartyIdForUser.mockResolvedValue(null);
        const brackets: Array<{ whereFactory: (b: unknown) => void }> = [];
        qb.where = vi.fn((arg: { whereFactory: (b: unknown) => void }) => {
            brackets.push(arg);
            return qb;
        });
        await resolver.myOrders(mockCtx, {});

        const inner = { where: vi.fn(() => inner), orWhere: vi.fn(() => inner) };
        brackets[0].whereFactory(inner);
        expect(inner.orWhere).not.toHaveBeenCalled();
    });

    it.each([true, false])('applies the source filter isExternal=%s', async value => {
        await resolver.myOrders(mockCtx, {
            options: { filter: { isExternal: { eq: value } } } as never,
        });
        expect(qb.andWhere).toHaveBeenCalledWith('"order"."customFieldsIsexternal" = :isExternal', {
            isExternal: value,
        });
    });
});
