import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { QueryTooLargeError } from 'shared';

import { SettlementAdminListService } from '../../settlement-admin-list.service';
import { SettlementDocumentTypeService } from '../../settlement-document-type.service';
import { SettlementReferenceResolver } from '../../settlement-reference-resolver';

const ctx = {} as RequestContext;

function queryReturning(n: number) {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) =>
        Array.from({ length: n }, (_, i) => ({ id: i, erpOrderId: `o${i}`, uuid: null })),
    );
    return { query, connection: { getRepository: () => ({ query }) } };
}

describe('settlement reads are bounded', () => {
    const keys = {
        counterpartyErpIds: [],
        contractErpIds: [],
        orders: [
            { orderErpId: 'o0', orderUuid: null },
            { orderErpId: 'o1', orderUuid: null },
        ],
    };
    const erp = { counterpartyIds: async () => new Map(), contractIds: async () => new Map() };

    it('reference resolver: the ceiling is the id count, one over throws', async () => {
        const ok = queryReturning(2);
        await new SettlementReferenceResolver(ok.connection as never, erp as never).resolve(
            ctx,
            keys,
        );
        expect(ok.query.mock.calls[0][0]).toMatch(/LIMIT 3$/);
        const over = queryReturning(3);
        await expect(
            new SettlementReferenceResolver(over.connection as never, erp as never).resolve(
                ctx,
                keys,
            ),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('document type list: 1000 types pass, 1001 throws', async () => {
        const ok = queryReturning(1000);
        const list = await new SettlementDocumentTypeService(ok.connection as never).listAll(ctx);
        expect(list).toHaveLength(1000);
        expect(ok.query.mock.calls[0][0]).toMatch(/LIMIT 1001$/);
        const over = queryReturning(1001);
        await expect(
            new SettlementDocumentTypeService(over.connection as never).listAll(ctx),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('type counts: 1000 groups pass, 1001 throws', async () => {
        const build = (n: number) => {
            const qb = {
                select: () => qb,
                addSelect: () => qb,
                groupBy: () => qb,
                orderBy: () => qb,
                addOrderBy: () => qb,
                limit: vi.fn(() => qb),
                getRawMany: vi.fn(async () =>
                    Array.from({ length: n }, (_, i) => ({
                        documentType: `t${i}`,
                        label: 'l',
                        count: 1,
                    })),
                ),
            };
            const service = new SettlementAdminListService({} as never, {} as never);
            vi.spyOn(service, 'baseQuery').mockResolvedValue(qb as never);
            return { service, qb };
        };
        const ok = build(1000);
        await expect(ok.service.typeCounts(ctx, {})).resolves.toHaveLength(1000);
        expect(ok.qb.limit).toHaveBeenCalledWith(1001);
        await expect(build(1001).service.typeCounts(ctx, {})).rejects.toBeInstanceOf(
            QueryTooLargeError,
        );
    });
});
