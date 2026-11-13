import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import {
    QueryTooLargeError,
    assertWithinCeiling,
    ctxQueryBounded,
    findBounded,
    getManyBounded,
    getRawManyBounded,
    readAllByKeyset,
} from '../../bounded-read';

const rows = (n: number): { id: number }[] => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

describe('QueryTooLargeError', () => {
    it('carries a stable code and the ceiling', () => {
        const err = new QueryTooLargeError(5);
        expect(err.extensions).toMatchObject({ code: 'QUERY_TOO_LARGE', ceiling: 5 });
        expect(err.message).toBe('The request is too large. Contact the developers.');
    });
});

describe('assertWithinCeiling', () => {
    it('passes a result at the ceiling and throws above it', () => {
        expect(assertWithinCeiling(rows(3), 3)).toHaveLength(3);
        expect(() => assertWithinCeiling(rows(4), 3)).toThrow(QueryTooLargeError);
    });
});

describe('query builder and find variants', () => {
    it('getManyBounded asks for ceiling + 1 rows', async () => {
        const qb = { take: vi.fn().mockReturnThis(), getMany: vi.fn(async () => rows(3)) };
        await expect(getManyBounded(qb as never, 3)).resolves.toHaveLength(3);
        expect(qb.take).toHaveBeenCalledWith(4);
    });

    it('getManyBounded throws when the extra row comes back', async () => {
        const qb = { take: vi.fn().mockReturnThis(), getMany: vi.fn(async () => rows(4)) };
        await expect(getManyBounded(qb as never, 3)).rejects.toThrow(QueryTooLargeError);
    });

    it('getRawManyBounded limits to ceiling + 1', async () => {
        const qb = { limit: vi.fn().mockReturnThis(), getRawMany: vi.fn(async () => rows(2)) };
        await getRawManyBounded(qb as never, 2);
        expect(qb.limit).toHaveBeenCalledWith(3);
    });

    it('findBounded overrides a caller take', async () => {
        const repo = { find: vi.fn(async () => rows(1)) };
        await findBounded(repo as never, { where: {}, take: 99 } as never, 10);
        expect(repo.find).toHaveBeenCalledWith({ where: {}, take: 11 });
    });
});

describe('ctxQueryBounded', () => {
    const run = (n: number) => {
        const query = vi.fn(async () => rows(n));
        const connection = { getRepository: () => ({ query }) };
        const call = () =>
            ctxQueryBounded(connection as never, {} as RequestContext, 'SELECT id FROM t;', [1], 3);
        return { query, call };
    };

    it('appends LIMIT ceiling + 1 and passes at the ceiling', async () => {
        const { query, call } = run(3);
        await expect(call()).resolves.toHaveLength(3);
        expect(query).toHaveBeenCalledWith('SELECT id FROM t LIMIT 4', [1]);
    });

    it('throws above the ceiling', async () => {
        await expect(run(4).call()).rejects.toThrow(QueryTooLargeError);
    });
});

describe('readAllByKeyset', () => {
    const table = rows(7);
    const fetch = vi.fn(async (after: number | string | null, limit: number) =>
        table.filter(r => after === null || r.id > Number(after)).slice(0, limit),
    );

    it('reads every row in id order across batches', async () => {
        const all = await readAllByKeyset(fetch, 3);
        expect(all.map(r => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(fetch).toHaveBeenCalledWith(6, 3);
    });

    it('stops after one call when the set is smaller than a batch', async () => {
        fetch.mockClear();
        await readAllByKeyset(fetch, 10);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does one extra empty read when the set is an exact multiple of the batch', async () => {
        fetch.mockClear();
        expect(await readAllByKeyset(fetch, 7)).toHaveLength(7);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('returns a set exactly at the ceiling and throws one row over', async () => {
        expect(await readAllByKeyset(fetch, 3, 7)).toHaveLength(7);
        await expect(readAllByKeyset(fetch, 3, 6)).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});
