import { describe, expect, it, vi } from 'vitest';
import { useBlockLoad } from '../../composables/useBlockLoad';

describe('useBlockLoad', () => {
    it('exposes the loaded data and no error on success', async () => {
        const block = useBlockLoad(() => Promise.resolve([1, 2]));
        await block.load();
        expect(block.data.value).toEqual([1, 2]);
        expect(block.error.value).toBeNull();
        expect(block.loading.value).toBe(false);
    });

    it('exposes the error message and keeps data null on failure, never an empty value', async () => {
        const block = useBlockLoad(() => Promise.reject(new Error('request too large')));
        await block.load();
        expect(block.data.value).toBeNull();
        expect(block.error.value).toBe('request too large');
        expect(block.loading.value).toBe(false);
    });

    it('falls back to a generic message when the rejection is not an Error', async () => {
        const block = useBlockLoad(() => Promise.reject('boom'));
        await block.load();
        expect(block.error.value).toBeTruthy();
        expect(block.data.value).toBeNull();
    });

    it('clears the error and drops stale data on a retry', async () => {
        const loader = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(new Error('down'))
            .mockResolvedValueOnce('ok');
        const block = useBlockLoad(loader);
        await block.load();
        expect(block.error.value).toBe('down');
        await block.load();
        expect(block.error.value).toBeNull();
        expect(block.data.value).toBe('ok');
    });

    it('reports loading while the loader is pending', async () => {
        let resolve: (v: number) => void = () => undefined;
        const block = useBlockLoad(() => new Promise<number>(r => (resolve = r)));
        const pending = block.load();
        expect(block.loading.value).toBe(true);
        resolve(1);
        await pending;
        expect(block.loading.value).toBe(false);
    });
});
