import { UserInputError } from '@vendure/core';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import type { ListQueryConfig, SuggestSpec } from './list-filter-engine';

export const SUGGEST_MIN_PREFIX = 2;
export const SUGGEST_DEFAULT_LIMIT = 10;
export const SUGGEST_MAX_LIMIT = 20;
export const SUGGEST_MAX_PREFIX = 64;

export function clampSuggestLimit(limit: number | undefined | null): number {
    const n = Math.trunc(limit ?? SUGGEST_DEFAULT_LIMIT);
    return Math.min(Math.max(n, 1), SUGGEST_MAX_LIMIT);
}

export function suggestSpecFor(config: ListQueryConfig, field: string): SuggestSpec {
    const spec = Object.prototype.hasOwnProperty.call(config.fields, field)
        ? config.fields[field].suggest
        : undefined;
    if (!spec) throw new UserInputError(`No suggestions for "${field}"`);
    return spec;
}

// null means "too short to ask the database" (an empty answer, not an error).
export function normalizeSuggestPrefix(config: ListQueryConfig, prefix: string): string | null {
    const max = Math.min(config.limits?.maxTextLength ?? SUGGEST_MAX_PREFIX, SUGGEST_MAX_PREFIX);
    const text = prefix.trim();
    if (text.length > max) throw new UserInputError('Invalid suggestion prefix');
    return text.length < SUGGEST_MIN_PREFIX ? null : text;
}

// Prefix match on lower(value) COLLATE "C" so a btree on the same expression serves both the range and the order.
// Rows are not distinct (a GROUP BY would defeat the early stop of LIMIT); callers dedupe.
export function applySuggest<E extends ObjectLiteral>(
    qb: SelectQueryBuilder<E>,
    spec: SuggestSpec,
    prefix: string,
    limit: number,
): void {
    const key = `lower(${spec.valueSql}) COLLATE "C"`;
    qb.select(spec.valueSql, 'value')
        .andWhere(`${key} LIKE lower(:suggestPrefix) || '%'`, {
            suggestPrefix: prefix.replace(/[\\%_]/g, '\\$&'),
        })
        .orderBy(key)
        .limit(spec.repeats ? limit * 2 : limit);
    if (spec.whereSql) qb.andWhere(spec.whereSql);
}

export function dedupeSuggestions(rows: { value: string | null }[], limit: number): string[] {
    const seen = new Set<string>();
    for (const { value } of rows) {
        if (value !== null) seen.add(value);
        if (seen.size >= limit) break;
    }
    return [...seen];
}
