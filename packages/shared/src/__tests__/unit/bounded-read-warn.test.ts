import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@vendure/core';

import { QueryTooLargeError } from '../../bounded-read';
import { readAllByKeysetWarned } from '../../bounded-read-warn';

const table = (n: number): { id: number }[] => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
const fetchFrom =
    (all: { id: number }[]) =>
    async (afterId: number | string | null, limit: number): Promise<{ id: number }[]> =>
        all.filter(r => r.id > Number(afterId ?? 0)).slice(0, limit);

afterEach(() => vi.restoreAllMocks());

describe('readAllByKeysetWarned', () => {
    it('warns once with the count when the read reaches 80 percent of the ceiling', async () => {
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
        const rows = await readAllByKeysetWarned(fetchFrom(table(8)), 'TestCtx', 3, 10);
        expect(rows).toHaveLength(8);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith('Read 8 rows, ceiling is 10', 'TestCtx');
    });

    it('stays silent below 80 percent', async () => {
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
        await readAllByKeysetWarned(fetchFrom(table(7)), 'TestCtx', 3, 10);
        expect(warn).not.toHaveBeenCalled();
    });

    it('fails with QueryTooLargeError over the ceiling and returns nothing partial', async () => {
        vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
        await expect(
            readAllByKeysetWarned(fetchFrom(table(11)), 'TestCtx', 3, 10),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});
