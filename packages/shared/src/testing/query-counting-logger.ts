export interface QueryCounter {
    count: number;
    queries?: string[];
}

// TypeORM `logger` option that counts executed queries (and keeps their text when `queries` is set), for "query count does not grow with rows" tests.
export function queryCountingLogger(counter: QueryCounter): {
    logQuery: (sql: string) => void;
    logQueryError: () => void;
    logQuerySlow: () => void;
    logSchemaBuild: () => void;
    logMigration: () => void;
    log: () => void;
} {
    const noop = (): void => undefined;
    return {
        logQuery: sql => {
            counter.count++;
            counter.queries?.push(sql);
        },
        logQueryError: noop,
        logQuerySlow: noop,
        logSchemaBuild: noop,
        logMigration: noop,
        log: noop,
    };
}
