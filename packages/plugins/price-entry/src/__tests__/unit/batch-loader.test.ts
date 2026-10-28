import { describe, expect, it, vi } from 'vitest';

import { BatchLoader } from '../../batch-loader';

describe('BatchLoader', () => {
    it('collects concurrent keys into one loadMany call and caches them', async () => {
        const loadMany = vi.fn(async (keys: string[]) => new Map(keys.map(k => [k, k.length])));
        const loader = new BatchLoader(loadMany, 1);

        const [a, b] = await Promise.all([
            loader.loadAll(['x', 'yy']),
            loader.loadAll(['yy', 'zzz']),
        ]);
        const again = await loader.loadAll(['x']);

        expect(loadMany).toHaveBeenCalledTimes(1);
        expect(loadMany).toHaveBeenCalledWith(['x', 'yy', 'zzz']);
        expect([...a]).toEqual([
            ['x', 1],
            ['yy', 2],
        ]);
        expect(b.get('zzz')).toBe(3);
        expect(again.get('x')).toBe(1);
    });

    it('leaves unknown keys out and does not cache a failed load', async () => {
        const loadMany = vi
            .fn<(keys: string[]) => Promise<Map<string, number>>>()
            .mockRejectedValueOnce(new Error('db down'))
            .mockResolvedValueOnce(new Map([['x', 1]]));
        const loader = new BatchLoader(loadMany, 1);

        await expect(loader.loadAll(['x'])).rejects.toThrow('db down');
        const retried = await loader.loadAll(['x', 'missing']);

        expect([...retried]).toEqual([['x', 1]]);
        expect(loadMany).toHaveBeenCalledTimes(2);
    });
});
