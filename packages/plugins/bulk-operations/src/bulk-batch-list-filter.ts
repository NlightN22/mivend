export interface BatchListOptions {
    take?: number | null;
    skip?: number | null;
    sort?: { field: string; direction: string } | null;
    filter?: {
        operationType?: string | null;
        status?: string | null;
        createdById?: string | null;
        numberPrefix?: string | null;
        createdFrom?: Date | null;
        createdTo?: Date | null;
    } | null;
}

export const SORT_COLUMNS: Record<string, string> = {
    createdAt: 'b."createdAt"',
    number: 'b.number',
    operationType: 'b."operationType"',
    status: 'b.status',
    totalCount: 'b."totalCount"',
};

// Operation types come first: a batch of a type the viewer may not run is never reachable.
export function buildBatchWhere(
    allowedTypes: string[],
    options: BatchListOptions,
): { sql: string; params: unknown[] } {
    const params: unknown[] = [allowedTypes];
    const clauses = [`b."operationType" = ANY($1::text[])`, `b.status <> 'draft'`];
    const add = (sql: string, value: unknown): void => {
        params.push(value);
        clauses.push(sql.split('?').join(`$${params.length}`));
    };
    const f = options.filter ?? {};
    if (f.operationType) add(`b."operationType" = ?`, f.operationType);
    if (f.status) add(`b.status = ?`, f.status);
    if (f.createdById) add(`b."createdById" = ?`, f.createdById);
    if (f.createdFrom) add(`b."createdAt" >= ?`, f.createdFrom);
    if (f.createdTo) add(`b."createdAt" < ?`, f.createdTo);
    if (f.numberPrefix) {
        add(
            `left(b.number::text, char_length(?::text)) = ?::text`,
            f.numberPrefix.replace(/\D/g, ''),
        );
    }
    return { sql: clauses.join(' AND '), params };
}
