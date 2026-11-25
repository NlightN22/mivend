import { INBOX_TO_IS_STREAM } from './order-events-message';

export interface ExchangePriorityTable {
    hash: string;
    levels: ReadonlyMap<string, number>;
}

export const MAX_PRIORITIES_BODY_BYTES = 1_000_000;

export class ExchangePrioritiesError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Fails closed on a malformed shape; items without an eventStream are kinds we do not consume.
export function parseExchangePriorities(raw: unknown): ExchangePriorityTable {
    if (!isRecord(raw) || typeof raw.hash !== 'string' || raw.hash === '') {
        throw new ExchangePrioritiesError('priorities response: missing hash');
    }
    if (!Array.isArray(raw.items)) {
        throw new ExchangePrioritiesError('priorities response: items is not a list');
    }
    const levels = new Map<string, number>();
    for (const item of raw.items) {
        if (!isRecord(item)) throw new ExchangePrioritiesError('priorities response: bad item');
        if (typeof item.level !== 'number' || !Number.isInteger(item.level) || item.level < 0) {
            throw new ExchangePrioritiesError('priorities response: bad level');
        }
        const stream = item.eventStream;
        if (stream === null || stream === undefined || stream === '') continue;
        if (typeof stream !== 'string') {
            throw new ExchangePrioritiesError('priorities response: bad eventStream');
        }
        const known = levels.get(stream);
        levels.set(stream, known === undefined ? item.level : Math.max(known, item.level));
    }
    for (const [inbox, isStream] of INBOX_TO_IS_STREAM) {
        const level = levels.get(isStream);
        if (level !== undefined && !levels.has(inbox)) levels.set(inbox, level);
    }
    return { hash: raw.hash, levels };
}
