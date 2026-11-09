import type { FieldChange, FieldChanges } from './change-journal.types';

export interface JournalColumn {
    propertyPath: string;
    isCreateDate: boolean;
    isUpdateDate: boolean;
    isVersion: boolean;
    getEntityValue(entity: object): unknown;
}

export interface JournalRelation {
    propertyPath: string;
    getEntityValue(entity: object): unknown;
}

const SECRET_TOKENS = new Set([
    'password',
    'passwd',
    'secret',
    'token',
    'hash',
    'salt',
    'totp',
    'otp',
    'recovery',
    'credential',
    'credentials',
    'apikey',
    'privatekey',
]);

const MAX_VALUE_CHARS = 4000;

function nameTokens(path: string): string[] {
    return path
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[\s._-]+/)
        .map(t => t.toLowerCase())
        .filter(Boolean);
}

export function isSecretField(path: string): boolean {
    const tokens = nameTokens(path);
    return tokens.some(
        (t, i) => SECRET_TOKENS.has(t) || SECRET_TOKENS.has(`${t}${tokens[i + 1] ?? ''}`),
    );
}

export const NESTED_REDACTED = '[redacted]';
export const UNSERIALIZABLE = '[unserializable]';

function sanitize(value: unknown, seen: WeakSet<object>): unknown {
    if (value === undefined || value === null) return null;
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return `[binary ${value.length} bytes]`;
    if (typeof value === 'bigint') return value.toString();
    // Postgres jsonb rejects \u0000; an ERP string carrying it must not fail the save.
    if (typeof value === 'string') return value.split('\u0000').join('');
    if (typeof value === 'function' || typeof value === 'symbol') return null;
    if (typeof value !== 'object') return value;
    if (seen.has(value)) throw new Error('cycle');
    seen.add(value);
    const out = Array.isArray(value)
        ? value.map(v => sanitize(v, seen))
        : Object.fromEntries(
              Object.entries(value).map(([k, v]) => [
                  k,
                  isSecretField(k) ? NESTED_REDACTED : sanitize(v, seen),
              ]),
          );
    seen.delete(value);
    return out;
}

// Relation objects become their id; nested secret keys are masked; anything unserializable is a marker.
export function normalizeValue(value: unknown): unknown {
    if (value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)) {
        const id = (value as { id?: unknown }).id;
        if (id !== undefined && !(value instanceof Date)) return normalizeValue(id);
    }
    let clean: unknown;
    let json: string;
    try {
        clean = sanitize(value, new WeakSet());
        json = JSON.stringify(clean) ?? '';
    } catch {
        return UNSERIALIZABLE;
    }
    if (typeof clean === 'string') {
        return clean.length > MAX_VALUE_CHARS
            ? `${clean.slice(0, MAX_VALUE_CHARS)}[truncated ${clean.length} chars]`
            : clean;
    }
    return json.length > MAX_VALUE_CHARS ? `[truncated ${json.length} chars]` : clean;
}

function fieldChange(path: string, change: FieldChange): FieldChange {
    return isSecretField(path) ? { redacted: true } : change;
}

function isTracked(column: JournalColumn): boolean {
    return !column.isCreateDate && !column.isUpdateDate && !column.isVersion;
}

export function snapshotChanges(
    columns: JournalColumn[],
    entity: object,
    side: 'before' | 'after',
): FieldChanges {
    const changes: FieldChanges = {};
    for (const column of columns.filter(isTracked)) {
        const value = normalizeValue(column.getEntityValue(entity));
        if (value === null) continue;
        changes[column.propertyPath] = fieldChange(column.propertyPath, { [side]: value });
    }
    return changes;
}

// Without a loaded database row (bulk paths) only the new values are known.
export function updateChanges(
    columns: JournalColumn[],
    relations: JournalRelation[],
    entity: object,
    before: object | undefined,
): FieldChanges {
    const changes: FieldChanges = {};
    const add = (path: string, read: (e: object) => unknown): void => {
        const after = normalizeValue(read(entity));
        if (!before) {
            changes[path] = fieldChange(path, { after });
            return;
        }
        const previous = normalizeValue(read(before));
        if (JSON.stringify(previous) === JSON.stringify(after)) return;
        changes[path] = fieldChange(path, { before: previous, after });
    };
    for (const column of columns.filter(isTracked)) {
        add(column.propertyPath, e => column.getEntityValue(e));
    }
    for (const relation of relations) {
        if (!(relation.propertyPath in changes)) {
            add(relation.propertyPath, e => relation.getEntityValue(e));
        }
    }
    return changes;
}
