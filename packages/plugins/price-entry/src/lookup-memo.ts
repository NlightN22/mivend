// Per-call cache for one whole-order evaluation: without it every line re-reads every sibling (n squared queries).
export class LookupMemo {
    private values = new Map<string, Promise<unknown>>();

    get<T>(key: string, load: () => Promise<T>): Promise<T> {
        let hit = this.values.get(key) as Promise<T> | undefined;
        if (!hit) {
            hit = load();
            this.values.set(key, hit);
        }
        return hit;
    }
}

export function memoized<T>(
    memo: LookupMemo | undefined,
    key: string,
    load: () => Promise<T>,
): Promise<T> {
    return memo ? memo.get(key, load) : load();
}
