import { Logger } from '@vendure/core';

import { KEYSET_BATCH_SIZE, KEYSET_CEILING, readAllByKeyset } from './bounded-read';

export const CEILING_WARN_RATIO = 0.8;

// readAllByKeyset that logs once per read when the row count reaches 80% of the ceiling.
export async function readAllByKeysetWarned<T extends { id: number | string }>(
    fetchBatch: (afterId: T['id'] | null, limit: number) => Promise<T[]>,
    loggerCtx: string,
    batchSize: number = KEYSET_BATCH_SIZE,
    ceiling: number = KEYSET_CEILING,
): Promise<T[]> {
    const rows = await readAllByKeyset(fetchBatch, batchSize, ceiling);
    if (rows.length >= ceiling * CEILING_WARN_RATIO) {
        Logger.warn(`Read ${rows.length} rows, ceiling is ${ceiling}`, loggerCtx);
    }
    return rows;
}
