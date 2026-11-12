const MAX_LISTED = 8;
const NAME_PATTERN = /^[A-Za-z0-9_]{1,80}$/;

export interface InFlightOperations {
    start(operationName: string | null | undefined, now: number): () => void;
    describe(now: number): string;
}

export function createInFlightOperations(): InFlightOperations {
    const active = new Map<symbol, { name: string; startedAt: number }>();
    return {
        start(operationName, now) {
            const key = Symbol('operation');
            const name =
                operationName && NAME_PATTERN.test(operationName)
                    ? operationName
                    : 'anonymous-operation';
            active.set(key, { name, startedAt: now });
            return () => {
                active.delete(key);
            };
        },
        describe(now) {
            const items = [...active.values()].sort((a, b) => a.startedAt - b.startedAt);
            if (items.length === 0) return 'none in flight';
            const listed = items
                .slice(0, MAX_LISTED)
                .map(item => `${item.name} ${Math.round(now - item.startedAt)} ms`);
            const more = items.length > MAX_LISTED ? ` and ${items.length - MAX_LISTED} more` : '';
            return `in flight, oldest first: ${listed.join(', ')}${more}`;
        },
    };
}
