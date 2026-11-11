// Row-budget assertions for list-path integration tests: a service must stay within a fixed number of rows.
export function expectRowBudget(
    result: readonly unknown[] | { items: readonly unknown[] },
    max: number,
): void {
    const rows = Array.isArray(result) ? result : (result as { items: readonly unknown[] }).items;
    if (rows.length > max) {
        throw new Error(`row budget exceeded: ${rows.length} rows returned, budget is ${max}`);
    }
}

// Statements that read `table` with no LIMIT: feed it the queries captured by a counting logger.
export function selectsWithoutLimit(queries: readonly string[], table: string): string[] {
    const from = new RegExp(`\\bfrom\\s+"?(?:\\w+"?\\.")?${table}"?\\s`, 'i');
    return queries.filter(
        sql =>
            /^\s*select\b/i.test(sql) &&
            from.test(sql) &&
            !/\blimit\b/i.test(sql) &&
            !/^\s*select\s+count\(/i.test(sql),
    );
}

export function expectNoUnlimitedSelect(queries: readonly string[], table: string): void {
    const offenders = selectsWithoutLimit(queries, table);
    if (offenders.length > 0) {
        throw new Error(
            `${offenders.length} unlimited SELECT on ${table}: ${offenders[0].slice(0, 160)}`,
        );
    }
}
