interface Waiter<V> {
    key: string;
    resolve: (value: V | undefined) => void;
    reject: (error: unknown) => void;
}

// Collects the keys asked for within a short window into one loadMany call, so a catalog page
// resolved variant by variant costs one query instead of one per variant. Results are cached per key.
export class BatchLoader<V> {
    private cache = new Map<string, Promise<V | undefined>>();
    private waiters: Array<Waiter<V>> = [];
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private loadMany: (keys: string[]) => Promise<Map<string, V>>,
        private windowMs = 5,
    ) {}

    loadAll(keys: string[]): Promise<Map<string, V>> {
        return Promise.all(
            keys.map(key => this.load(key).then(value => [key, value] as const)),
        ).then(entries => {
            const found = new Map<string, V>();
            for (const [key, value] of entries) if (value !== undefined) found.set(key, value);
            return found;
        });
    }

    private load(key: string): Promise<V | undefined> {
        let hit = this.cache.get(key);
        if (!hit) {
            hit = new Promise<V | undefined>((resolve, reject) => {
                this.waiters.push({ key, resolve, reject });
            });
            hit.catch(() => this.cache.delete(key));
            this.cache.set(key, hit);
            this.timer ??= setTimeout(() => void this.flush(), this.windowMs);
        }
        return hit;
    }

    private async flush(): Promise<void> {
        this.timer = null;
        const batch = this.waiters;
        this.waiters = [];
        try {
            const loaded = await this.loadMany([...new Set(batch.map(w => w.key))]);
            for (const w of batch) w.resolve(loaded.get(w.key));
        } catch (error) {
            for (const w of batch) w.reject(error);
        }
    }
}
