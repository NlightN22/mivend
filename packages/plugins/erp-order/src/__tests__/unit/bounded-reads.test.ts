import { describe, expect, it, vi } from 'vitest';
import { QueryTooLargeError } from 'shared';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ExternalOrderService } from '../../external-order.service';
import { OrderStatusHistoryService } from '../../order-status-history.service';
import { OrderStatusReferenceService } from '../../order-status-reference.service';
import { OrderVisibilityAggregatesService } from '../../order-visibility-aggregates.service';
import { OrderVisibilityService } from '../../order-visibility.service';

const ctx = {} as unknown as RequestContext;
const rowsOf = (count: number, row: object = {}): object[] =>
    Array.from({ length: count }, () => row);
const connectionOf = (repo: object): TransactionalConnection =>
    ({ getRepository: () => repo }) as unknown as TransactionalConnection;

function builder(count: number, row: object): Record<string, unknown> {
    const qb: Record<string, unknown> = { alias: 'order' };
    for (const method of ['select', 'addSelect', 'where', 'andWhere', 'orderBy', 'groupBy'])
        qb[method] = () => qb;
    qb.take = vi.fn(() => qb);
    qb.limit = vi.fn(() => qb);
    qb.getMany = vi.fn(async () => rowsOf(count, row));
    qb.getRawMany = vi.fn(async () => rowsOf(count, row));
    return qb;
}

describe('erp-order reads fail over the ceiling', () => {
    it('visibleIds uses the distinct id count as its ceiling', async () => {
        const read = (count: number): Promise<Set<string>> => {
            const service = Object.create(
                OrderVisibilityService.prototype,
            ) as OrderVisibilityService;
            service.buildVisibleOrdersQuery = vi.fn(async () => builder(count, { id: 1 })) as never;
            return service.visibleIds(ctx, [1, 2, 2]);
        };
        await expect(read(2)).resolves.toBeInstanceOf(Set);
        await expect(read(3)).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('lastOrderDates allows one row per counterparty id and throws one over', async () => {
        const read = (count: number): Promise<unknown> => {
            const qb = builder(count, { counterpartyId: '1', lastOrderAt: new Date() });
            const service = new OrderVisibilityAggregatesService(
                { buildVisibleOrdersQuery: vi.fn(async () => qb) } as never,
                {} as never,
            );
            return service.lastOrderDates(ctx, ['1', '2']);
        };
        await expect(read(2)).resolves.toHaveLength(2);
        await expect(read(3)).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('status history of one order passes at 1000 rows and throws one over', async () => {
        const read = (count: number): Promise<unknown> =>
            new OrderStatusHistoryService(
                connectionOf({ find: vi.fn(async () => rowsOf(count)) }) as never,
            ).list(ctx, 1);
        await expect(read(1000)).resolves.toHaveLength(1000);
        await expect(read(1001)).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('status dictionary passes at 1000 rows and throws one over', async () => {
        const read = (count: number): Promise<unknown> =>
            new OrderStatusReferenceService(
                connectionOf({
                    find: vi.fn(async () => rowsOf(count, { code: 'c', rank: 1 })),
                }) as never,
            ).dictionary(ctx);
        await expect(read(1000)).resolves.toBeTruthy();
        await expect(read(1001)).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('external order variants pass at the distinct id count and throw one over', async () => {
        const read = async (count: number): Promise<{ sql: string; map: Map<string, unknown> }> => {
            const query = vi.fn(async () => rowsOf(count, { id: '1', taxCategoryId: '2' }));
            const service = new ExternalOrderService(
                connectionOf({ query }) as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
            );
            const input = {
                lines: [
                    { productVariantId: '1' },
                    { productVariantId: '2' },
                    { productVariantId: '2' },
                ],
            };
            const map = await (
                service as unknown as {
                    loadVariants: (c: RequestContext, i: unknown) => Promise<Map<string, unknown>>;
                }
            ).loadVariants(ctx, input);
            return { sql: (query.mock.calls[0] as unknown as string[])[0], map };
        };
        const ok = await read(2);
        expect(ok.sql).toMatch(/LIMIT 3$/);
        await expect(read(3)).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});
