export interface QueryCounter {
    count: number;
}

// TypeORM `logger` option that only counts executed queries, for "query count does not grow with rows" tests.
export function queryCountingLogger(counter: QueryCounter): {
    logQuery: () => void;
    logQueryError: () => void;
    logQuerySlow: () => void;
    logSchemaBuild: () => void;
    logMigration: () => void;
    log: () => void;
} {
    const noop = (): void => undefined;
    return {
        logQuery: () => {
            counter.count++;
        },
        logQueryError: noop,
        logQuerySlow: noop,
        logSchemaBuild: noop,
        logMigration: noop,
        log: noop,
    };
}
