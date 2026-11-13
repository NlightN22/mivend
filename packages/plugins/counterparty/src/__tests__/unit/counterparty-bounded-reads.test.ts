import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { QueryTooLargeError } from 'shared';

import { ContactPointService } from '../../contact-point.service';
import { ContractService } from '../../contract.service';
import { CounterpartyBatchLoaders } from '../../counterparty-batch-loaders.service';
import { CounterpartyPortalAccessExecutor } from '../../counterparty-portal-access.executor';

const ctx = { apiType: 'admin' } as RequestContext;
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
const scopeAll = { resolveCounterpartyScope: vi.fn(async () => ({ kind: 'all' })) };

function connectionOf(repo: object) {
    return { getRepository: () => repo } as never;
}

describe('findBounded sites (ContractService)', () => {
    it('passes at the ceiling and throws one over', async () => {
        const find = vi.fn();
        const service = new ContractService(connectionOf({ find }));
        find.mockResolvedValueOnce(rows(1000));
        expect(await service.findActiveForCounterparty(ctx, 1)).toHaveLength(1000);
        expect(find).toHaveBeenCalledWith(expect.objectContaining({ take: 1001 }));
        find.mockResolvedValueOnce(rows(1001));
        await expect(service.findActiveCustomerContracts(ctx, 1)).rejects.toBeInstanceOf(
            QueryTooLargeError,
        );
    });
});

describe('getManyBounded site (hidden flag loader)', () => {
    function loaders(count: number) {
        const qb = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            take: vi.fn().mockReturnThis(),
            getMany: vi.fn(async () => rows(count)),
        };
        const built = new CounterpartyBatchLoaders(
            connectionOf({ createQueryBuilder: () => qb }),
            scopeAll as never,
            {} as never,
        );
        return { built, qb };
    }

    it('bounds the read by the number of ids passed in', async () => {
        const { built, qb } = loaders(2);
        const [a, b] = await Promise.all([built.isHidden(ctx, 1), built.isHidden(ctx, 2)]);
        expect([a, b]).toEqual([false, false]);
        expect(qb.take).toHaveBeenCalledWith(3);
    });

    it('throws when more rows than ids come back', async () => {
        const { built } = loaders(3);
        const reads = Promise.all([built.isHidden(ctx, 1), built.isHidden(ctx, 2)]);
        await expect(reads).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});

describe('findBounded site with several rows per id (trading point loader)', () => {
    function loaders(count: number) {
        const find = vi.fn(async () => rows(count).map(r => ({ ...r, counterpartyId: '1' })));
        const built = new CounterpartyBatchLoaders(
            connectionOf({ find }),
            scopeAll as never,
            {} as never,
        );
        return { built, find };
    }

    it('allows 100 points per counterparty and fails above it', async () => {
        const ok = loaders(100);
        expect(await ok.built.tradingPoints(ctx, 1)).toHaveLength(100);
        expect(ok.find).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));
        await expect(loaders(101).built.tradingPoints(ctx, 1)).rejects.toBeInstanceOf(
            QueryTooLargeError,
        );
    });
});

describe('getRawManyBounded site (visibleTargets)', () => {
    function executor(count: number) {
        const qb = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            getRawMany: vi.fn(async () => rows(count)),
        };
        const built = new CounterpartyPortalAccessExecutor(
            {} as never,
            connectionOf({ createQueryBuilder: () => qb }),
            scopeAll as never,
            {} as never,
            {} as never,
            {} as never,
        );
        return { built, qb };
    }

    it('passes with every id visible and throws when rows exceed the ids passed in', async () => {
        const ok = executor(2);
        expect(await ok.built.visibleTargets(ctx, ['1', '2'])).toEqual(new Set(['1', '2']));
        expect(ok.qb.limit).toHaveBeenCalledWith(3);
        await expect(executor(3).built.visibleTargets(ctx, ['1', '2'])).rejects.toBeInstanceOf(
            QueryTooLargeError,
        );
    });
});

describe('ctxQueryBounded site (chosenContacts)', () => {
    function service(count: number) {
        const query = vi.fn(async () => rows(count));
        return { service: new ContactPointService(connectionOf({ query })), query };
    }

    it('limits the query to the number of ids plus one', async () => {
        const { service: s, query } = service(2);
        expect((await s.chosenContacts(ctx, [1, 2])).size).toBe(2);
        expect(query).toHaveBeenCalledWith(expect.stringMatching(/LIMIT 3$/), [[1, 2]]);
    });

    it('throws when more rows than ids come back', async () => {
        await expect(service(3).service.chosenContacts(ctx, [1, 2])).rejects.toBeInstanceOf(
            QueryTooLargeError,
        );
    });
});
