import type { RequestContext } from '@vendure/core';
import DataLoader from 'dataloader';

// One DataLoader per RequestContext: sibling ResolveField calls of a request share a single batch query.
// Never shared across requests; do not keep one ctx across logical operations, the cache is never refreshed. The batch returns one value (or Error) per key, in key order.
export class CtxLoader<V> {
    private loaders = new WeakMap<RequestContext, DataLoader<string, V>>();

    constructor(
        private batch: (
            ctx: RequestContext,
            keys: readonly string[],
        ) => Promise<ReadonlyArray<V | Error>>,
    ) {}

    load(ctx: RequestContext, key: string | number): Promise<V> {
        let loader = this.loaders.get(ctx);
        if (!loader) {
            loader = new DataLoader<string, V>(keys => this.batch(ctx, keys));
            this.loaders.set(ctx, loader);
        }
        return loader.load(String(key));
    }
}
