import { describe, expect, it, vi } from 'vitest';

import { LookupMemo, memoized } from '../../lookup-memo';

describe('LookupMemo', () => {
    it('loads a key once and shares the result', async () => {
        const memo = new LookupMemo();
        const load = vi.fn(async () => 42);
        expect(await Promise.all([memo.get('k', load), memo.get('k', load)])).toEqual([42, 42]);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('keeps keys apart', async () => {
        const memo = new LookupMemo();
        expect(await memo.get('a', async () => 1)).toBe(1);
        expect(await memo.get('b', async () => 2)).toBe(2);
    });

    it('memoized without a memo always loads', async () => {
        const load = vi.fn(async () => 1);
        await memoized(undefined, 'k', load);
        await memoized(undefined, 'k', load);
        expect(load).toHaveBeenCalledTimes(2);
    });
});
