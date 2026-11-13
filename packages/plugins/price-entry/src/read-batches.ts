export const READ_BATCH_SIZE = 500;

export async function collectKeyset<T extends { id: number | string }>(
    loadAfter: (lastId: number, batchSize: number) => Promise<T[]>,
    batchSize = READ_BATCH_SIZE,
): Promise<T[]> {
    const all: T[] = [];
    let lastId = 0;
    for (;;) {
        const batch = await loadAfter(lastId, batchSize);
        all.push(...batch);
        if (batch.length < batchSize) return all;
        lastId = Number(batch[batch.length - 1].id);
    }
}

export const DEFAULT_LIST_TAKE = 50;
export const MAX_LIST_TAKE = 200;

export interface ListOptions {
    take?: number | null;
    skip?: number | null;
}

export function pageArgs(options?: ListOptions): { take: number; skip: number } {
    return {
        take: Math.min(Math.max(options?.take ?? DEFAULT_LIST_TAKE, 1), MAX_LIST_TAKE),
        skip: Math.max(options?.skip ?? 0, 0),
    };
}
