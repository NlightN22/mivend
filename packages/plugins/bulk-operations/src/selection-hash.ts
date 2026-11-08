import { createHash } from 'node:crypto';
import { UserInputError } from '@vendure/core';

import { MAX_SELECTION } from './types';

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : 1,
        );
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function normaliseSelection(ids: string[]): string[] {
    const unique = [...new Set(ids.map(String))].sort();
    if (unique.length === 0) throw new UserInputError('Select at least one record');
    if (unique.length > MAX_SELECTION) {
        throw new UserInputError(`At most ${MAX_SELECTION} records per batch`);
    }
    return unique;
}

export function selectionHash(
    type: string,
    parameters: Record<string, unknown>,
    ids: string[],
): string {
    return createHash('sha256')
        .update(`${type}|${canonical(parameters)}|${ids.join(',')}`)
        .digest('hex');
}
