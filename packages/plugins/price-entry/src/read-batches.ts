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
