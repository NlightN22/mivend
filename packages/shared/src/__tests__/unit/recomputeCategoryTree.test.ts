import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { recomputeCategoryTree } from '../../recomputeCategoryTree';

const collection = (
    id: number,
    parentId: number | null,
    slug: string,
    extra: Record<string, unknown> = {},
) => ({
    id,
    parentId,
    isPrivate: false,
    filters: [],
    customFields: {},
    translations: [{ languageCode: 'en', name: slug, slug, description: '' }],
    ...extra,
});

function build(collections: ReturnType<typeof collection>[]): {
    update: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
    run: () => Promise<number>;
} {
    const update = vi.fn();
    const withTransaction = vi.fn((c: unknown, work: (tx: unknown) => unknown) => work(c));
    const deps = {
        connection: {
            withTransaction,
            getRepository: () => ({
                find: vi.fn().mockResolvedValue(collections),
                query: vi.fn().mockResolvedValue([{ previous: '0' }]),
            }),
        },
        collectionService: { update },
        facetService: { findByCode: vi.fn().mockResolvedValue({ id: 1 }) },
        facetValueService: {
            findByFacetId: vi.fn().mockResolvedValue([
                { id: 11, code: 'p' },
                { id: 12, code: 'c' },
            ]),
        },
    };
    return {
        update,
        withTransaction,
        run: () => recomputeCategoryTree({} as RequestContext, deps as never),
    };
}

describe('recomputeCategoryTree', () => {
    it('always passes the existing translations, or Vendure inserts a new Collection instead', async () => {
        const { update, run } = build([
            collection(1, null, '__root_collection__'),
            collection(2, 1, 'cat-p'),
            collection(3, 2, 'cat-c'),
        ]);
        await run();
        expect(update).toHaveBeenCalled();
        for (const [, input] of update.mock.calls) {
            expect(input.translations).toEqual([
                expect.objectContaining({ languageCode: 'en', slug: expect.any(String) }),
            ]);
        }
    });

    it('hides the children of a placeholder parent and widens the parent filter', async () => {
        const { update, run } = build([
            collection(1, null, '__root_collection__'),
            collection(2, 1, 'cat-gone', { isPrivate: true }),
            collection(3, 2, 'cat-c'),
        ]);
        await run();
        expect(update).toHaveBeenCalledWith(
            {},
            expect.objectContaining({ id: 3, isPrivate: true, translations: expect.any(Array) }),
        );
    });

    it('locks and commits once per top-level subtree and rolls back only the failing chunk', async () => {
        const { update, withTransaction, run } = build([
            collection(1, null, '__root_collection__'),
            collection(2, 1, 'cat-p'),
            collection(3, 2, 'cat-c'),
            collection(4, 1, 'cat-gone', { isPrivate: true }),
            collection(5, 4, 'cat-x'),
        ]);
        update.mockImplementation((_c: unknown, input: { id: number }) => {
            if (input.id === 5) throw new Error('boom');
        });
        await expect(run()).rejects.toThrow('boom');
        expect(withTransaction).toHaveBeenCalledTimes(2);
        expect(update.mock.calls.some(([, i]) => i.id === 2)).toBe(true);
    });

    it('makes no writes for an already-consistent tree', async () => {
        const { update, run } = build([collection(1, null, '__root_collection__')]);
        expect(await run()).toBe(0);
        expect(update).not.toHaveBeenCalled();
    });
});
