export type ConsistencyFailureKind =
    | 'unreachable'
    | 'unauthorized'
    | 'forbidden'
    | 'no-check-yet'
    | 'rate-limited'
    | 'bad-request'
    | 'server-error'
    | 'malformed';

const TRUNCATION_MARKER = '...[truncated]';

export function truncateText(text: string, max: number): string {
    return text.length > max ? text.slice(0, max) + TRUNCATION_MARKER : text;
}

export const MAX_ERROR_MESSAGE = 4096;

export class ConsistencyClientError extends Error {
    constructor(
        readonly kind: ConsistencyFailureKind,
        message: string,
        readonly retryAfterSeconds?: number,
    ) {
        super(truncateText(message, MAX_ERROR_MESSAGE));
        this.name = 'ConsistencyClientError';
    }
}
